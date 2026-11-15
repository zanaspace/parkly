19s
Run pnpm lint

> parkly@ lint /home/runner/work/parkly/parkly/parkly-app
> turbo run lint


Attention:
Turborepo now collects completely anonymous telemetry regarding usage.
This information is used to shape the Turborepo roadmap and prioritize features.
You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:
https://turborepo.dev/docs/telemetry


   • Packages in scope: @parkly/admin, @parkly/api, @parkly/config, @parkly/contracts, @parkly/db, @parkly/domain, @parkly/mobile, @parkly/portal, @parkly/tokens, @parkly/ui, @parkly/ui-native, @parkly/web
   • Running lint in 12 packages
   • Remote caching disabled

@parkly/tokens:build
@parkly/tokens:lint
@parkly/domain:build
@parkly/ui-native:build
@parkly/ui:lint
@parkly/ui-native:lint
@parkly/domain:lint
@parkly/ui:build
@parkly/contracts:lint
@parkly/db:lint
@parkly/contracts:build
@parkly/db:build
@parkly/web:lint
@parkly/mobile:lint
@parkly/admin:lint
@parkly/portal:lint
@parkly/api:lint
Error: command (/home/runner/work/parkly/parkly/parkly-app/apps/api) /home/runner/setup-pnpm/node_modules/.bin/pnpm run lint exited (1)
@parkly/api#lint:  ERROR  command (/home/runner/work/parkly/parkly/parkly-app/apps/api) /home/runner/setup-pnpm/node_modules/.bin/pnpm run lint exited (1)
cache miss, executing b13f88115851aed4

> @parkly/api@0.0.0 lint /home/runner/work/parkly/parkly/parkly-app/apps/api
> eslint .


/home/runner/work/parkly/parkly/parkly-app/apps/api/src/modules/corporate/routes.ts
Error:   84:11  error  'tenant' is never reassigned. Use 'const' instead  prefer-const

✖ 1 problem (1 error, 0 warnings)
  1 error and 0 warnings potentially fixable with the `--fix` option.

 ELIFECYCLE  Command failed with exit code 1.
 ERROR  run failed: command  exited (1)

 Tasks:    16 successful, 17 total
Cached:    0 cached, 17 total
  Time:    18.436s 
Failed:    @parkly/api#lint

 ELIFECYCLE  Command failed with exit code 1.
Error: Process completed with exit code 1.