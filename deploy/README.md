# deploy

one small linux server (live on an azure vm, standard b2as v2 in central india, resource group rg-pehra) runs everything with docker compose: postgres, hasura
and the envio indexer, the api, and caddy for https. only ports 80 and 443 are open.

1. install docker on the server, clone the repo
2. copy `services/api/.env` and the whole `services/api/data` folder from the machine that runs the api
   now (it holds the guard's keys and the sqlite database, keep it private)
3. `cp deploy/.env.example deploy/.env` and fill it: a domain pointed at the server (or
   `<ip-with-dashes>.sslip.io`), two long random passwords, and the envio hypersync token
4. `cd deploy && docker compose up -d --build`
5. the indexer backfills from block 64.4m in a few minutes, then `https://<domain>/health` answers

the app reads the api address from `apps/mobile/src/trade.ts`, point it at `https://<domain>` before the
release build.

backups: `~/backup.sh` runs nightly from cron at 03:30, a sqlite `.backup` of the database and a tar of the keys, a week kept in `~/backups`.
