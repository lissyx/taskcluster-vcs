import { spawn } from 'child_process';
import util from 'util';
import eventToPromise from 'event-to-promise';
import fs from 'fs';

const DEFAULT_RETRIES = 10;
const RETRY_SLEEP = 10000;
const RANDOMIZATION_FACTOR = 0.25;

/**
Wrapper around process spawning with extra logging.

@param {Array[String]} command for command,
@param {Object} opts usual options for spawn.
@param {Boolean} opts.buffer buffer output and return [stdout, stderr].
*/
export default async function run(command, config = {}, _try=0) {
  if (Array.isArray(command)) {
    command = command.join(' ');
  }

  let opts = Object.assign({
    stdio: 'pipe',
    buffer: false,
    verbose: true,
    raiseError: true,
    retries: 0
  }, config);

  let cwd = opts.cwd || process.cwd();
  var start = Date.now();
  if (opts.verbose) {
    console.log(`[taskcluster-vcs] ${_try} run start : (cwd: ${cwd}) ${command}`);
  }
  var proc = spawn('/bin/bash', ['-c'].concat(command), opts);
  let stdout = '';
  let stderr = '';

  proc.stdout.on('data', (buffer) => {
    if (opts.verbose) process.stdout.write(buffer);
    if (opts.buffer) stdout += buffer;
  });

  proc.stderr.on('data', (buffer) => {
    if (opts.verbose) process.stdout.write(buffer);
    if (opts.buffer) stderr += buffer;
  });


  await Promise.all([
    eventToPromise(proc.stdout, 'end'),
    eventToPromise(proc.stderr, 'end'),
    eventToPromise(proc, 'exit')
  ])

  if (opts.verbose && proc.exitCode == 0) {
    console.log(
      '[taskcluster-vcs] run end : %s (%s) in %s ms',
      command, proc.exitCode, Date.now() - start
    );
  }

  if (proc.exitCode != 0) {
    if (_try < opts.retries) {
      let delay = Math.pow(2, _try) * RETRY_SLEEP;
      let rf = RANDOMIZATION_FACTOR; // Apply randomization factor
      delay = delay * (Math.random() * 2 * rf + 1 - rf);

      console.error(
        '[taskcluster-vcs:warning] run end (with error) try (%d/%d) retrying in %d ms : %s',
        _try,
        opts.retries,
        delay,
        command
      );

      // Sleep for a bit..
      await new Promise(accept => setTimeout(accept, delay));

      let retryOpts = Object.assign({}, opts);

      // Issue the retry...
      return await run(command, retryOpts, _try + 1);
    } else {
      // Only log message as an error if raiseError is enabled, otherwise treat it
      // as a warning
      let message = '[taskcluster-vcs:%s] run end (with error) NOT RETRYING!: %s';

      if (opts.raiseError) {
        console.error(message, 'error', command);
        let err = Error(`Error running command: ${command}`);
        err.retired = _try;
        throw err;
      } else {
        console.log(message, 'warning', command);
      }
    }

  }

  return [stdout, stderr];
}
