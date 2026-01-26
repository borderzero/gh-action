# SSH Shell Access to your GitHub Actions VM

Get instant SSH access to your GitHub Actions runner VM using Border0's ephemeral connector. Perfect for debugging failed workflows or inspecting build environments.

For more details: https://www.border0.com/blogs/ssh-shell-access-to-your-github-actions-vm

## Features

- **Ephemeral connectors** - Auto-cleanup when workflow ends, no manual cleanup needed
- **Built-in SSH service** - Ready to use immediately
- **Custom tags** - Add metadata tags to your connector's socket
- **GitHub context tags** - Automatically tag with repository, workflow, run ID, etc.
- **Slack notifications** - Get notified when the connector starts

## Quickstart

1. [Register a Border0 account](https://portal.border0.com/register)
2. Create a service account at [Border0 Admin Portal](https://portal.border0.com) -> Team -> Service Accounts
3. Generate a token with `Admin` permissions
4. Add the token as `BORDER0_TOKEN` in your GitHub repository secrets

```yaml
name: My Workflow
on: [push]
jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Your build steps
        run: echo "Building..."

      - name: Setup Border0 (on failure)
        if: ${{ failure() }}
        uses: borderzero/gh-action@v3
        with:
          token: ${{ secrets.BORDER0_TOKEN }}
          wait-for: 15
```

**Note:** No cleanup step is needed - ephemeral connectors automatically clean up when the workflow ends.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `token` | Yes | - | Border0 API token |
| `wait-for` | No | `15` | Minutes to wait before exiting |
| `background-mode` | No | `false` | Run connector in background |
| `connector-name` | No | auto | Override auto-generated connector name |
| `builtin-socket-tags` | No | - | Tags for the socket (format: `key1=value1,key2=value2`) |
| `include-github-tags` | No | `false` | Add GitHub context tags automatically |
| `slack-webhook-url` | No | - | Slack webhook for notifications |

## Connector Naming

By default, the connector name follows this pattern:
```
{github-org}-{github-repo}-{run-id}-{run-attempt}
```

Example: `myorg-myrepo-12345678-1`

Override with `connector-name` input if needed.

## Usage Examples

### Trigger on Failure

Debug failed builds by adding `if: ${{ failure() }}`:

```yaml
- name: Setup Border0
  if: ${{ failure() }}
  uses: borderzero/gh-action@v3
  with:
    token: ${{ secrets.BORDER0_TOKEN }}
    wait-for: 15
```

### With Custom Tags

Add metadata tags to identify and filter connectors:

```yaml
- name: Setup Border0
  if: ${{ failure() }}
  uses: borderzero/gh-action@v3
  with:
    token: ${{ secrets.BORDER0_TOKEN }}
    builtin-socket-tags: "environment=ci,team=platform,app=myservice"
    include-github-tags: true
    wait-for: 15
```

When `include-github-tags: true`, these tags are added automatically:
- `github_repository`
- `github_workflow`
- `github_run_id`
- `github_actor`
- `github_ref`
- `github_sha`

### Background Mode

Run the connector in background while other steps continue:

```yaml
- name: Setup Border0
  uses: borderzero/gh-action@v3
  with:
    token: ${{ secrets.BORDER0_TOKEN }}
    background-mode: true

- name: Continue with other steps
  run: echo "Connector running in background"
```

### Slack Notifications

Get notified when the connector starts:

```yaml
- name: Setup Border0
  if: ${{ failure() }}
  uses: borderzero/gh-action@v3
  with:
    token: ${{ secrets.BORDER0_TOKEN }}
    slack-webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
    wait-for: 15
```

### Manual Debug Trigger

Add a manual trigger option for on-demand debugging:

```yaml
name: My Workflow
on:
  push:
  workflow_dispatch:
    inputs:
      debug:
        type: boolean
        description: Enable Border0 debugging
        required: false
        default: false
jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build
        run: npm run build

      - name: Setup Border0 (manual debug)
        if: ${{ github.event_name == 'workflow_dispatch' && inputs.debug }}
        uses: borderzero/gh-action@v3
        with:
          token: ${{ secrets.BORDER0_TOKEN }}
          wait-for: 15
```

## Connecting

Once the action runs, connect using the Border0 client:

```bash
# Via connector
border0 client ssh --connector {connector-name}

# Via built-in SSH socket
border0 client ssh runner@ssh-{connector-name}
```

The connector and its socket will appear in the [Border0 Admin Portal](https://portal.border0.com).

## Migration from v2

If migrating from v2 (socket-based approach):

1. **Remove cleanup steps** - No longer needed
2. **Update secret name** - `BORDER0_ADMIN_TOKEN` → `BORDER0_TOKEN`
3. **Remove `clean-up-mode`** - Input no longer exists
4. **Update action version** - `borderzero/gh-action@v2` → `borderzero/gh-action@v3`

Before (v2):
```yaml
- name: Setup Border0
  uses: borderzero/gh-action@v2
  with:
    token: ${{ secrets.BORDER0_ADMIN_TOKEN }}
    background-mode: true

- name: Cleanup Border0
  if: always()
  uses: borderzero/gh-action@v2
  with:
    token: ${{ secrets.BORDER0_ADMIN_TOKEN }}
    clean-up-mode: true
```

After (v3):
```yaml
- name: Setup Border0
  uses: borderzero/gh-action@v3
  with:
    token: ${{ secrets.BORDER0_TOKEN }}
    background-mode: true
# No cleanup step needed!
```
