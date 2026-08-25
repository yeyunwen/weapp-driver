# Security

WeApp Driver controls a logged-in WeChat DevTools instance and can invoke Mini Program APIs. Treat it as a local developer tool with the same access as the current user.

## Safe usage

- Use dedicated test accounts and non-production environments.
- Review an Agent's requested flow before allowing actions that create orders, send messages, upload builds, publish previews, or mutate cloud resources.
- Do not put AppID secrets, access tokens, account tickets, or production credentials in scripts committed to a repository.
- Keep the daemon socket local. Its default permissions are restricted to the current user.
- Install Skills only from a source you have reviewed; Skills run with the permissions granted to the Agent.

## Reporting a vulnerability

Use the repository's GitHub Security Advisory form to report vulnerabilities privately. Do not include live credentials or customer data in an issue.
