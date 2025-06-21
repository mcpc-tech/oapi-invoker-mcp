#!/usr/bin/env deno
const timestamp = (Date.now()/1000).toFixed();
Deno.stdout.write(new TextEncoder().encode(timestamp));
