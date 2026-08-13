# Local OpenTofu contract

This root module proves pinned, declarative infrastructure planning without a
paid cloud account or provider credentials. It models LAS and CHI as logical
sites while explicitly recording their shared WSL physical failure domain.

Run through the pinned container:

```bash
npm run tofu:validate
npm run tofu:plan
```

The generated plan is evidence for review, not permission to execute a change.
