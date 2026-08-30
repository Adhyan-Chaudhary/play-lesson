#!/usr/bin/env node
import { main } from "../src/cli.mjs";

main(process.argv.slice(2)).catch((err) => {
  process.exitCode = 1;
  console.error(`\n  ${err?.message ?? err}\n`);
  if (process.env.PLAY_DEBUG === "1" && err?.stack) console.error(err.stack);
});
