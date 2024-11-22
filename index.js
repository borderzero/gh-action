const { spawn, execSync, spawnSync, execFileSync } = require('child_process');
const core = require('@actions/core');
const exec = require('@actions/exec');
const os = require('os');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function queryAPI(token, socketName) {
  const url = `https://api.border0.com/api/v1/socket/${socketName}`;
  const headers = {
    'accept': 'application/json',
    'x-access-token': token
  };

  try {
    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error) {
    console.error(`Failed to query API: ${error.message}`);
    throw error;
  }
}

async function addTagsToSocket(token, apiSocketData) {
  const repositoryInfo = process.env.GITHUB_REPOSITORY.split('/');
  const owner = repositoryInfo[0];
  const repositoryName = repositoryInfo[1];
  const socketName = apiSocketData.name;

  try {
    // Prepare the new tags
    const workflowName = getEnvVar('GITHUB_WORKFLOW');;
    const iconText = `${workflowName} action #${process.env.GITHUB_RUN_ID}`;
    const newTags = {
      border0_client_category: 'GitHub Actions',
      border0_client_subcategory: process.env.GITHUB_REPOSITORY,
      border0_client_icon: 'devicon-plain:githubactions',
      provider_type: 'azure',
      border0_client_icon_text: iconText
    };



    const updatedTags = { ...apiSocketData.tags, ...newTags };

    // Prepare the updated socket data
    const updatedSocketData = { ...apiSocketData, tags: updatedTags };
    const url = `https://api.border0.com/api/v1/socket/${socketName}`;
    const headers = {
      'accept': 'application/json',
      'x-access-token': token,
    };

    const response = await axios.put(url, updatedSocketData, { headers });
    if (response.status !== 200) {
      throw new Error(`Failed to update socket tags: ${response.data}`);
    }

    console.log(`Successfully updated tags for socket ${socketName}`);
  } catch (error) {
    console.error(`Failed to update tags: ${error.message}`);
    //throw error;  // Re-throw the error to be handled by the calling function
  }
}

function extractOrgName(responseData, socketName) {
  const dnsName = responseData.dnsname;
  const intermediateValue = dnsName.substring(socketName.length + 1);
  const trailingString = ".border0.io";
  const finalValue = intermediateValue.substring(0, intermediateValue.length - trailingString.length);

  return finalValue;
}

async function sendSlackMessage(slackWebhookUrl, messageBlocks) {
  try {
    await axios.post(slackWebhookUrl, { blocks: messageBlocks }, { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error(`Failed to send message to Slack: ${error.message}`);
  }
}

function constructSlackMessage(jobStatus, workflowName, workflowRunUrl, actorName, socketDnsName, socketOrgName) {
  const iconEmoji = jobStatus === 'Success' ? ':heavy_check_mark:' : ':x:';
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Border0 for GitHub Workflow Run <${workflowRunUrl}|${workflowName}>`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Hey, ${actorName}. Your github workflow is running Border0 Socket. You can click the link below to log in and troubleshoot:`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `https://client.border0.com/#/ssh/${socketDnsName}?org=${socketOrgName}`
      }
    }
  ];
}


function printInfo(jobStatus, workflowName, workflowRunUrl, actorName, socketDnsName, socketOrgName, sshUsername, slackWebhookUrl) {
  console.log(`

  GitHub Workflow Run ${jobStatus}: ${workflowName} (${workflowRunUrl})

Hey, ${actorName}. Your github workflow is running Border0 Socket. You can click the link below to log in and troubleshoot:
https://client.border0.com/#/ssh/${socketDnsName}?org=${socketOrgName}

Alternatively, use the following command to ssh into this GitHub VM:
$> border0 client ssh ${sshUsername}@${socketDnsName}
  `);
  if (slackWebhookUrl) {
    const messageBlocks = constructSlackMessage(jobStatus, workflowName, workflowRunUrl, actorName, socketDnsName, socketOrgName);
    sendSlackMessage(slackWebhookUrl, messageBlocks)
      .then(() => {
        console.log('Message sent to Slack successfully.');
      })
      .catch(error => {
        console.error(`Failed to send message to Slack: ${error.message}`);
      });
  } else {
    console.log('Slack webhook URL not provided. Skipping Slack notification...');
  }
}

function getEnvVar(name) {
  let value = process.env[name];
  if (value === undefined) {
    value = 'GitHubRunner';
  }
  return value;
}

async function createSocketIfNeeded(env, socketName, slackWebhookUrl, token) {
  const githubActionPath = process.env.GITHUB_ACTION_PATH || '/tmp/';
  const flagFile = path.join(githubActionPath, 'border0.socket-created');
  if (fs.existsSync(flagFile)) {
    console.log('Socket already created. Skipping creation...');
    return;
  }

  if (!fs.existsSync('./border0')) {
    const binaryUrl = 'https://download.border0.com/linux_amd64/border0 ';
    console.log('border0 binary not found locally. Downloading...');
    await exec.exec(`curl -s -LJO ${binaryUrl}`);
    await exec.exec('chmod +x border0');
  }

  const sshUsername = os.userInfo().username;
  const createSocketCommand = `./border0 socket create --type ssh --name ${socketName} --upstream_username ${sshUsername}`;
  await exec.exec(createSocketCommand, [], { env });
  fs.writeFileSync(flagFile, 'Socket created on ' + new Date().toISOString());

  const apiSocketData = await queryAPI(token, socketName);
  addTagsToSocket(token, apiSocketData);

  const socketDnsName = apiSocketData.dnsname;
  const socketOrgName = await extractOrgName(apiSocketData, socketName)
  const jobStatus = process.env.GITHUB_JOB_STATUS || 'Success';
  const workflowName = getEnvVar('GITHUB_WORKFLOW');;
  const workflowRunUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const actorName = getEnvVar('GITHUB_ACTOR');

  if (slackWebhookUrl) {
    console.log('Slack webhook URL provided. Sending Slack notification...');
  } else {
    console.log('Slack webhook URL not provided. Skipping Slack notification...');
  }

  await printInfo(jobStatus, workflowName, workflowRunUrl, actorName, socketDnsName, socketOrgName, sshUsername, slackWebhookUrl);
}

async function run() {
  try {
    const token = core.getInput('token');
    const sshUsername = os.userInfo().username;
    const slackWebhookUrl = core.getInput('slack-webhook-url');
    const backgroundMode = core.getInput('background-mode') === 'true';
    const cleanUP = core.getInput('clean-up-mode') === 'true';
    const waitForMinutes = parseInt(core.getInput('wait-for'), 10);
    const env = {
      ...process.env,
      BORDER0_ADMIN_TOKEN: token
    };
    const repoStr = process.env.GITHUB_REPOSITORY.replace(/\//g, '-');
    // Adding run attempt to the socket name to avoid conflicts (based on community feedback)
    const socketName = `${repoStr}-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
    const githubActionPath = process.env.GITHUB_ACTION_PATH || '/tmp/';

    // We don't need to create a socket if we are running cleanup
    if (!cleanUP) { await createSocketIfNeeded(env, socketName, slackWebhookUrl, token); }

    const cleanup = () => {
      const cleanupFlagFile = path.join(githubActionPath, 'border0.cleaned-up');
      if (fs.existsSync(cleanupFlagFile)) {
        console.log('Cleanup has already ran. Skipping...');
        return;
      }
      const deleteSocketCommand = `./border0 socket delete ${socketName}`;
      try {
        execSync(deleteSocketCommand, { env });
        console.log(`Socket ${socketName} deleted`);
        fs.writeFileSync(cleanupFlagFile, 'Cleanup completed on ' + new Date().toISOString());
      } catch (error) {
        console.error(`Failed to delete socket: ${error.message}`);
      }
      process.exit(0);
    };

    if (cleanUP) {
      console.log(`Running cleanup...`);
      cleanup();
      return;
    }

    let bgModeProc;
    const isBoRunning = spawnSync('pgrep', ['-f', `sh -c ./border0 socket connect`]).status === 0;
    if (!isBoRunning) {
      const connectSocketCommand = `./border0 socket connect ${socketName} --sshserver --upstream_username ${sshUsername}`;

      bgModeProc = spawn(connectSocketCommand, {
        shell: true,
        env,
        detached: backgroundMode,
        stdio: 'ignore'
      });
    }

    let checkInterval;
    const checkProcess = () => {
      const isProcessRunning = spawnSync('pgrep', ['-f', `sh -c ./border0 socket connect`]).status === 0;
      if (!isProcessRunning) {
        clearInterval(checkInterval);
        console.log('Process has exited early. Running cleanup...');
        cleanup();
      }
    };

    if (waitForMinutes > 0 && !backgroundMode) {
      console.log(`Waiting for ${waitForMinutes} minute(s) before proceeding...`);
      checkInterval = setInterval(checkProcess, 10000);
      await new Promise(resolve => setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, waitForMinutes * 60 * 1000));
      cleanup();
    }

    const onProcessExit = new Promise((resolve, reject) => {
      bgModeProc.on('exit', (code) => {
        console.log(`Subprocess exited with code ${code}`);
        resolve();
      });
      bgModeProc.on('error', (error) => {
        console.error(`Subprocess error: ${error.message}`);
        reject(error);
      });
    });

    if (backgroundMode) {
      bgModeProc.unref();
    } else {
      console.log(`Starting Border0 in the foreground, will give it ${waitForMinutes} minutes...`);
      const onTimeout = new Promise(resolve => setTimeout(resolve, waitForMinutes * 60 * 1000));
      await Promise.race([onProcessExit, onTimeout]);
      console.log(`Time is UP! Running cleanup...`);
      await cleanup();
    }

    if (backgroundMode) {
      bgModeProc.on('exit', cleanup);
    } else {
      process.on('exit', cleanup);
    }

    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });

  } catch (error) {
    core.setFailed(error.message);
    process.exit(1);
  }
}

run();
