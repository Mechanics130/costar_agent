# Security Policy for CoStar by Codex

CoStar handles relationship context, so privacy matters.

## What to report

Please report:

- exposed API keys or local model credentials
- sample data leaks that reveal internal project names or real user data
- repository paths that should not be public
- any bug that could cause cross-user data mixing

## How to report

For now, please use a private channel or a direct issue to the maintainers
instead of posting sensitive details in a public issue.

## What not to share publicly

- `model-config.local.json`
- real meeting notes
- real contact exports
- internal customer / project codenames

## Rotation guidance

If a local API key is exposed:

1. revoke it with the model provider
2. create a new local config file
3. delete old run artifacts that contain the key
