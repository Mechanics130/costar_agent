# Contributing to CoStar

Thanks for taking a look at CoStar.

## How to contribute

1. Open an issue or draft PR first if the change is large.
2. Keep commits focused and easy to review.
3. Prefer small, incremental changes over broad rewrites.
4. Update the relevant README or sample if behavior changes.
5. Keep public samples free of internal project names and local paths.

## Local checks

Before opening a PR, run:

```powershell
npm test
```

If you change a runtime file, also run the relevant skill sample directly.

## Repo boundaries

- `main` should stay clean and user-facing.
- Development history, validation assets, and private scenario outputs belong
  outside the public distribution branch.
- Real user data should stay local unless it is explicitly approved for sharing.
