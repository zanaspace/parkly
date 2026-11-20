15s
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
@parkly/ui-native:lint
@parkly/ui:lint
@parkly/ui:build
@parkly/domain:lint
@parkly/db:lint
@parkly/contracts:lint
@parkly/contracts:build
@parkly/db:build
@parkly/web:lint
cache miss, executing 36dbf9b5f091a884

> @parkly/web@0.0.0 lint /home/runner/work/parkly/parkly/parkly-app/apps/web
> eslint .


/home/runner/work/parkly/parkly/parkly-app/apps/web/lib/auth/actions.ts
Error:   145:7  error  Unexpected console statement  no-console
Error:   148:5  error  Unexpected console statement  no-console

✖ 2 problems (2 errors, 0 warnings)

 ELIFECYCLE  Command failed with exit code 1.
@parkly/api:lint
@parkly/portal:lint
@parkly/admin:lint
@parkly/mobile:lint
Error: command (/home/runner/work/parkly/parkly/parkly-app/apps/web) /home/runner/setup-pnpm/node_modules/.bin/pnpm run lint exited (1)
@parkly/web#lint:  ERROR  command (/home/runner/work/parkly/parkly/parkly-app/apps/web) /home/runner/setup-pnpm/node_modules/.bin/pnpm run lint exited (1)
 ERROR  run failed: command  exited (1)

 Tasks:    12 successful, 17 total
Cached:    0 cached, 17 total
  Time:    14.498s 
Failed:    @parkly/web#lint

 ELIFECYCLE  Command failed with exit code 1.
Error: Process completed with exit code 1.