# Security Policy for CoStar

CoStar handles relationship context, so privacy matters.

## What to report

Please report:

- exposed API keys or local model credentials
- sample data leaks that reveal internal project names or real user data
- repository paths that should not be public
- any bug that could cause cross-user data mixing

## How to report

Please use a private GitHub Security Advisory when possible:

- [Open a private security advisory](https://github.com/Mechanics130/costar_agent/security/advisories/new)

If you cannot use a GitHub advisory, contact the maintainers at:

- `security@costar.dev`

Please do not post sensitive details in a public issue.

## What not to share publicly

- `relationship-ingestion/runtime/model-config.local.json`
- real meeting notes
- real contact exports
- internal customer / project codenames

## Rotation guidance

If a local API key is exposed:

1. revoke it with the model provider
2. create a new local config file
3. delete old run artifacts that contain the key
