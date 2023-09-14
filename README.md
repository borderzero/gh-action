# gh-action

Border0 action companion for debugging in GitHub Actions.

## Quickstart

To get started with this action, you'll need to [register a Border0 account](https://portal.border0.com/register), and generate an admin token
by going to [Border0 Admin Portal](https://portal.border0.com) -> Organization Settings -> Access Tokens, create a token in `Admin` permission groups,
and then add the token in your GitHub repository's secrets.

**NOTE**: Be sure to configure a timeout, as the default GitHub action timeout is set to 360 minutes (6 hours).

```yaml
name: My Workflow
on: [push]
jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Border0 action
        uses: borderzero/gh-action@v1
        with:
          token: ${{ secrets.BORDER0_ADMIN_TOKEN }}
        timeout-minutes: 15
```

Once the `Setup Border0 action` has been run, a Border0 SSH socket will be created. It will then appear on the `Sockets` page
in the [Border0 Admin Portal](https://portal.border0.com).

The name of the SSH debug socket will follow this naming convention:

```
{github-org-name}-{github-repo-name}-{github-workflow-run-id}
```

## Automatically trigger on failure

Add `if: ${{ failure() }}` to your Border0 action, and the action will only be triggered when previous steps in the job fail.

```yaml
name: My Workflow
on: [push]
jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Border0 action
        if: ${{ failure() }}
        uses: borderzero/gh-action@v1
        with:
          token: ${{ secrets.BORDER0_ADMIN_TOKEN }}
        timeout-minutes: 15
```

## Slack notification

Add `slack-webhook-url` to the `with` section of the Border0 action step. Doing so will enable the action to send
you a Slack message when the Border0 action is triggered.

```yaml
name: My Workflow
on: [push]
jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Border0 action
        if: ${{ failure() }}
        uses: borderzero/gh-action@v1
        with:
          token: ${{ secrets.BORDER0_ADMIN_TOKEN }}
          slack-webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
        timeout-minutes: 15
```

## Manually trigger for debug

Add the `workflow_dispatch` configuration and the `if: ${{ github.event_name == 'workflow_dispatch' && inputs.debug }}`
condition to the Border0 action. This will allow you to manually trigger the Border0 action when the `debug` input is set to `true`.

```yaml
name: My Workflow
on:
  push:
  workflow_dispatch:
    inputs:
      debug:
        type: boolean
        description: Manually trigger debugging mode with Border0 for the GitHub workflow run
        required: false
        default: false
jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Border0 action
        if: ${{ github.event_name == 'workflow_dispatch' && inputs.debug }}
        uses: borderzero/gh-action@v1
        with:
          token: ${{ secrets.BORDER0_ADMIN_TOKEN }}
        timeout-minutes: 15
```
