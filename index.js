const { spawn, spawnSync } = require('child_process');
const core = require('@actions/core');
const exec = require('@actions/exec');
const os = require('os');
const fs = require('fs');
const axios = require('axios');

async function sendSlackMessage(slackWebhookUrl, messageBlocks) {
  try {
    await axios.post(slackWebhookUrl, { blocks: messageBlocks }, { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error(`Failed to send message to Slack: ${error.message}`);
  }
}

function constructSlackMessage(workflowName, workflowRunUrl, actorName, connectorName) {
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
        text: `Hey, ${actorName}. Your GitHub workflow is running with Border0 ephemeral connector. You can connect via Border0 client:`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `\`border0 client ssh ssh-${connectorName}\``
      }
    }
  ];
}

function getEnvVar(name, defaultValue = 'GitHubRunner') {
  const value = process.env[name];
  return value !== undefined ? value : defaultValue;
}

function printConnectionInfo(connectorName, sshUsername, slackWebhookUrl) {
  const workflowName = getEnvVar('GITHUB_WORKFLOW');
  const workflowRunUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const actorName = getEnvVar('GITHUB_ACTOR');

  console.log(`
================================================================================
Border0 Ephemeral Connector Started
================================================================================

GitHub Workflow: ${workflowName}
Workflow Run: ${workflowRunUrl}
Actor: ${actorName}

Connect using the Border0 client:
  border0 client ssh --connector ${connectorName}

Or use the built-in SSH socket:
  border0 client ssh ${sshUsername}@ssh-${connectorName}

The connector will automatically clean up when the workflow ends.
================================================================================
`);

  if (slackWebhookUrl) {
    console.log('Sending Slack notification...');
    const messageBlocks = constructSlackMessage(workflowName, workflowRunUrl, actorName, connectorName);
    sendSlackMessage(slackWebhookUrl, messageBlocks)
      .then(() => console.log('Slack notification sent.'))
      .catch(error => console.error(`Slack notification failed: ${error.message}`));
  }
}

async function downloadBorder0Binary() {
  if (fs.existsSync('./border0')) {
    console.log('border0 binary already exists.');
    return;
  }

  const binaryUrl = 'https://download.border0.com/linux_amd64/border0';
  console.log('Downloading border0 binary...');
  await exec.exec(`curl -s -LJO ${binaryUrl}`);
  await exec.exec('chmod +x border0');
  console.log('border0 binary downloaded and ready.');
}

function buildTagsArgument(builtinSocketTags, includeGithubTags) {
  const tags = [];

  if (builtinSocketTags) {
    tags.push(builtinSocketTags);
  }

  if (includeGithubTags) {
    const githubTags = [
      `github_repository=${process.env.GITHUB_REPOSITORY || ''}`,
      `github_workflow=${getEnvVar('GITHUB_WORKFLOW', '')}`,
      `github_run_id=${process.env.GITHUB_RUN_ID || ''}`,
      `github_actor=${getEnvVar('GITHUB_ACTOR', '')}`,
      `github_ref=${process.env.GITHUB_REF || ''}`,
      `github_sha=${process.env.GITHUB_SHA || ''}`
    ];
    tags.push(githubTags.join(','));
  }

  return tags.length > 0 ? tags.join(',') : null;
}

async function startEphemeralConnector(env, connectorName, builtinSocketTags, includeGithubTags, slackWebhookUrl, backgroundMode) {
  await downloadBorder0Binary();

  const sshUsername = os.userInfo().username;
  const tagsArg = buildTagsArgument(builtinSocketTags, includeGithubTags);

  let command = `./border0 connector start --ephemeral --name ${connectorName}`;
  if (tagsArg) {
    command += ` --builtin-socket-tags "${tagsArg}"`;
  }

  console.log(`Starting ephemeral connector: ${connectorName}`);

  const connectorProc = spawn(command, {
    shell: true,
    env,
    detached: backgroundMode,
    stdio: backgroundMode ? 'ignore' : 'inherit'
  });

  if (backgroundMode) {
    connectorProc.unref();

    // Set up process group to prevent GitHub Actions from killing it
    if (connectorProc.pid) {
      try {
        process.kill(-connectorProc.pid, 0);
      } catch (e) {
        // Ignore errors, process might not have started yet
      }
    }

    console.log('Ephemeral connector started in background mode.');
    console.log(`Process PID: ${connectorProc.pid}`);
  }

  printConnectionInfo(connectorName, sshUsername, slackWebhookUrl);

  return connectorProc;
}

async function run() {
  try {
    const token = core.getInput('token');
    const slackWebhookUrl = core.getInput('slack-webhook-url');
    const backgroundMode = core.getInput('background-mode') === 'true';
    const waitForMinutes = parseInt(core.getInput('wait-for'), 10);
    const connectorNameOverride = core.getInput('connector-name');
    const builtinSocketTags = core.getInput('builtin-socket-tags');
    const includeGithubTags = core.getInput('include-github-tags') === 'true';

    const env = {
      ...process.env,
      BORDER0_TOKEN: token
    };

    const repoStr = process.env.GITHUB_REPOSITORY.replace(/\//g, '-');
    const connectorName = connectorNameOverride ||
      `${repoStr}-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;

    const connectorProc = await startEphemeralConnector(
      env,
      connectorName,
      builtinSocketTags,
      includeGithubTags,
      slackWebhookUrl,
      backgroundMode
    );

    if (backgroundMode) {
      console.log('Running in background mode. Connector will auto-cleanup when workflow ends.');
      console.log('Note: In GitHub Actions, background processes may be terminated when the action step completes.');
      console.log('Consider using a longer wait-for time instead of background mode for better reliability.');

      // Add a small delay to ensure the connector has time to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      return;
    }

    if (waitForMinutes > 0) {
      console.log(`Waiting for ${waitForMinutes} minute(s)...`);

      const checkInterval = setInterval(() => {
        const isRunning = spawnSync('pgrep', ['-f', 'border0 connector start']).status === 0;
        if (!isRunning) {
          console.log('Connector process has exited.');
          clearInterval(checkInterval);
          process.exit(0);
        }
      }, 10000);

      await new Promise(resolve => setTimeout(resolve, waitForMinutes * 60 * 1000));
      clearInterval(checkInterval);
      console.log('Wait time completed. Terminating connector...');

      // Kill the connector process
      connectorProc.kill('SIGTERM');

      // Give it a moment to exit gracefully, then force kill if needed
      setTimeout(() => {
        if (!connectorProc.killed) {
          console.log('Force killing connector process...');
          connectorProc.kill('SIGKILL');
        }
      }, 5000);

      return;
    }

    const onProcessExit = new Promise((resolve, reject) => {
      connectorProc.on('exit', (code) => {
        console.log(`Connector exited with code ${code}`);
        resolve();
      });
      connectorProc.on('error', (error) => {
        console.error(`Connector error: ${error.message}`);
        reject(error);
      });
    });

    await onProcessExit;

  } catch (error) {
    core.setFailed(error.message);
    process.exit(1);
  }
}

run();
