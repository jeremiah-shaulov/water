// To run:
// rm -rf .vscode/coverage/profile && deno test --fail-fast --trace-leaks --allow-all --coverage=.vscode/coverage/profile private/tests/all.test.ts && deno coverage --unstable .vscode/coverage/profile --lcov > .vscode/coverage/lcov.info

import {RdStream, type Source, TrStream, WrStream} from '../../mod.ts';
import {assertEquals, assert} from './deps.ts';

/**	Embedded deno reader fails with `error: Promise resolution is still pending but the event loop has already resolved`
	when calling `read()`.
 **/
const DENO_READER_HAS_BUG_1 = true;

/**	Embedded deno reader hangs forever when calling `read(view, {min})` when there are few bytes left that the specified `min`.
 **/
const DENO_READER_HAS_BUG_2 = true;

// deno-lint-ignore no-explicit-any
type Any = any;

const textEncoder = new TextEncoder;
const textDecoder = new TextDecoder;

const C_SPACE = ' '.charCodeAt(0);

const LOR = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus dignissim magna non mi ullamcorper, et varius ex pretium. Vestibulum suscipit libero vel enim cursus tempor. Vivamus rutrum, sapien sed sagittis rhoncus, nunc sapien lacinia neque, sit amet sagittis ipsum massa pellentesque nunc. Etiam dictum facilisis tellus vel sagittis. Donec vel bibendum tellus, in finibus quam. Vivamus vitae finibus quam. Quisque tristique ante eget aliquam mollis. Cras diam neque, congue vitae neque a, venenatis pretium lorem. Nunc semper luctus lacinia. Duis id sagittis ex. In malesuada malesuada interdum. Proin consectetur bibendum ligula, egestas suscipit metus lobortis sed. Integer consequat massa vel justo egestas, eget mollis arcu volutpat. Vestibulum dapibus vulputate lorem, eu pellentesque mi placerat eu. Nullam lobortis ultrices enim sed iaculis.";

function readToPull(read: (view: Uint8Array) => number | null | Promise<number|null>, limitItems=Number.MAX_SAFE_INTEGER): UnderlyingByteSource
{	let i = 0;
	let cancelled = false;
	let pendingPromise: Promise<void>|undefined;

	return {
		type: 'bytes',

		pull(controller: ReadableByteStreamController)
		{	if (cancelled)
			{	controller.close();
				return;
			}

			const view = controller.byobRequest?.view;
			const readTo = !view ? new Uint8Array(8*1024) : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
			const resultOrPromise = read(readTo);

			function next(n: number|null)
			{	pendingPromise = undefined;
				if (cancelled)
				{	controller.close();
					return;
				}
				if (n == null)
				{	controller.close();
				}
				else if (view)
				{	try
					{	controller.byobRequest.respond(n);
					}
					catch
					{	// Handle case where controller is already closed
					}
				}
				else
				{	try
					{	controller.enqueue(readTo.subarray(0, n));
					}
					catch
					{	// Handle case where controller is already closed
					}
				}
				if (++i == limitItems)
				{	controller.close();
				}
			}

			if (typeof(resultOrPromise)=='number' || resultOrPromise==null)
			{	next(resultOrPromise);
			}
			else
			{	pendingPromise = resultOrPromise.then(next).catch
				(	err =>
					{	pendingPromise = undefined;
						if (!cancelled)
						{	try
							{	controller.error(err);
							}
							catch
							{	// Handle case where controller is already closed
							}
						}
					}
				);
				return pendingPromise;
			}
		},

		cancel()
		{	cancelled = true;
			// Don't return a promise here to avoid additional async tracking
		}
	};
}

function writeToWrite(write: (chunk: Uint8Array) => number | Promise<number>)
{	return {
		write(chunk: Uint8Array)
		{	while (chunk.byteLength > 0)
			{	const resultOrPromise = write(chunk);
				if (typeof(resultOrPromise) == 'number')
				{	chunk = chunk.subarray(resultOrPromise);
				}
				else
				{	return resultOrPromise.then
					(	async nWritten =>
						{	chunk = chunk.subarray(nWritten);
							while (chunk.byteLength > 0)
							{	nWritten = await write(chunk);
								chunk = chunk.subarray(nWritten);
							}
						}
					);
				}
			}
		}
	};
}

function createTcpServer(handler: (conn: Deno.Conn) => Promise<void>, maxConns=10)
{	// Open TCP listener on random port
	const listener = Deno.listen({transport: 'tcp', hostname: '127.0.0.1', port: 0});
	// Figure out the port
	const port = listener.addr.transport=='tcp' ? listener.addr.port : 0;
	// Accept connections
	async function accept()
	{	const promises = new Array<Promise<void>>;
		for await (const conn of listener)
		{	const promise = handler(conn).catch(e => console.log(e));
			promises.push(promise);
			promise.finally
			(	() =>
				{	const i = promises.indexOf(promise);
					if (i != -1)
					{	promises.splice(i, 1);
					}
				}
			);
			if (promises.length >= maxConns)
			{	await promises.shift();
			}
		}
		await Promise.all(promises);
	}
	const acceptPromise = accept().catch(e => console.log(e));
	// Return the server
	return {
		port,

		async [Symbol.asyncDispose]()
		{	listener.close();
			// Wait for the accept loop to finish
			await acceptPromise;
		},
	};
}

async function connectWithRetry(port: number, nAttempts=20)
{	for (let i=1; true; i++)
	{	try
		{	return await Deno.connect({port});
		}
		catch (e)
		{	if (i >= nAttempts)
			{	throw e;
			}
			console.warn('Will retry failed connection', e);
			await new Promise(y => setTimeout(y, i*100));
		}
	}
}

class StringStreamer extends RdStream
{	constructor(str='')
	{	let data = textEncoder.encode(str);
		super
		(	{	read(view)
				{	const n = Math.min(view.byteLength, data.byteLength);
					view.set(data.subarray(0, n));
					data = data.subarray(n);
					return n;
				}
			}
		);
	}
}

const EMPTY_CHUNK = new Uint8Array;

class StringSink extends WrStream
{	value = '';

	constructor()
	{	const decoder = new TextDecoder;
		super
		(	{	write: chunk =>
				{	this.value += decoder.decode(chunk, {stream: true});
					return chunk.byteLength;
				},

				finally()
				{	decoder.decode(EMPTY_CHUNK); // this is required to free the `decoder` resource
				}
			}
		);
	}

	override toString()
	{	return this.value;
	}
}

class CopyOneToken extends TrStream
{	constructor()
	{	super
		(	{	async transform(writer, chunk)
				{	const len = chunk.byteLength;
					for (let i=0; i<len; i++)
					{	if (chunk[i] == C_SPACE)
						{	await writer.write(chunk.subarray(0, i));
							await writer.close();
							return i + 1;
						}
					}
					await writer.write(chunk);
					return len;
				}
			}
		);
	}
}

Deno.test
(	'Pipe error',
	async () =>
	{	const r1 = new ReadableStream
		(	{	start(c)
				{	c.enqueue(new Uint8Array([65, 66]));
					c.error(new Error('Hello error'));
				}
			}
		);

		const s2: Source & {f: boolean} =
		{	f: false,

			read(b)
			{	if (!this.f)
				{	this.f = true;
					b[0] = 65;
					b[1] = 66;
					return 2;
				}
				else
				{	throw new Error('Hello error');
				}
			}
		};
		const r2 = new RdStream(s2);

		let error1: Error|undefined;
		try
		{	await r1.pipeTo(Deno.stdout.writable, {preventClose: true, preventCancel: true, preventAbort: true});
		}
		catch (e)
		{	error1 = e instanceof Error ? e : new Error(e+'');
		}


		let error2: Error|undefined;
		try
		{	await r2.pipeTo(Deno.stdout.writable, {preventClose: true, preventCancel: true, preventAbort: true});
		}
		catch (e)
		{	error2 = e instanceof Error ? e : new Error(e+'');
		}

		assertEquals(error1?.message.includes('Hello error'), true);
		assertEquals(error2?.message.includes('Hello error'), true);
	}
);

Deno.test
(	'isClosed',
	async () =>
	{	let lor = textEncoder.encode(LOR);

		function read(view: Uint8Array)
		{	if (lor.byteLength == 0)
			{	return null;
			}
			const nRead = Math.min(lor.byteLength, view.byteLength);
			view.set(lor.subarray(0, nRead));
			lor = lor.subarray(nRead);
			return nRead;
		}

		const rs = new RdStream({read});
		let isClosed = false;
		rs.closed.then(() => isClosed = true);
		const reader = rs.getReader();

		assertEquals(isClosed, false);
		assertEquals(rs.isClosed, false);
		assertEquals(reader.isClosed, false);

		const text = await reader.text();

		assertEquals(text, LOR);

		assertEquals(isClosed, true);
		assertEquals(rs.isClosed, true);
		assertEquals(reader.isClosed, true);
	}
);

Deno.test
(	'Reader: Callbacks',
	async () =>
	{	for (let c=0; c<4; c++) // cancel doesn't throw, cancel throws before awaiting, cancel throws after awaiting
		{	for (let a=0; a<2; a++) // ReadableStream or RdStream
			{	let i = 0;
				const log = new Array<string>;

				// deno-lint-ignore no-inner-declarations
				async function start()
				{	log.push('<start>');
					await new Promise(y => setTimeout(y, 50));
					log.push('</start>');
				}

				// deno-lint-ignore no-inner-declarations
				async function read(view: Uint8Array)
				{	log.push('<read>');
					await new Promise(y => setTimeout(y, 10));
					view[0] = i++;
					log.push('</read>');
					return 1;
				}

				// deno-lint-ignore no-inner-declarations
				async function cancel()
				{	log.push('<cancel>');
					if (c == 1)
					{	throw new Error('Cancel failed');
					}
					await new Promise(y => setTimeout(y, 100));
					if (c == 2)
					{	throw new Error('Cancel failed');
					}
					log.push('</cancel>');
				}

				const rs = a==0 ? new ReadableStream({start, ...readToPull(read), cancel}) : new RdStream({start, read, cancel});

				assertEquals(log, ['<start>']);

				if (c == 3)
				{	const promise = rs.cancel();
					assertEquals(log, ['<start>', '<cancel>']);
					await promise;
					assertEquals(log, ['<start>', '<cancel>', '</start>', '</cancel>']);
				}

				const r = rs.getReader();
				r.closed.then(() => log.push('closed'), e => log.push('closed with error: '+e));
				let promise = r.read();

				if (c != 3)
				{	assertEquals(log, ['<start>']);
				}
				else
				{	assertEquals(log, ['<start>', '<cancel>', '</start>', '</cancel>']);
				}

				let res = await promise;

				if (c != 3)
				{	assertEquals(log, ['<start>', '</start>', '<read>', '</read>']);
					assertEquals(res, {done: false, value: new Uint8Array([0])});
				}
				else
				{	assertEquals(log, ['<start>', '<cancel>', '</start>', '</cancel>', 'closed']);
					assertEquals(res, {done: true, value: undefined});
					continue;
				}

				promise = r.read();
				await new Promise(y => setTimeout(y, 1));

				assertEquals(log, ['<start>', '</start>', '<read>', '</read>', '<read>']);

				const promise2 = r.cancel();

				assertEquals(log, ['<start>', '</start>', '<read>', '</read>', '<read>', '<cancel>']);

				res = await promise;

				assertEquals(log, ['<start>', '</start>', '<read>', '</read>', '<read>', '<cancel>', 'closed']);
				assertEquals(res, {done: true, value: undefined});

				let error: Error|undefined;
				try
				{	await promise2;
				}
				catch (e)
				{	error = e instanceof Error ? e : new Error(e+'');
				}

				if (c == 0)
				{	assertEquals(log, ['<start>', '</start>', '<read>', '</read>', '<read>', '<cancel>', 'closed', '</read>', '</cancel>']);
				}
				else if (c == 1)
				{	assertEquals(error?.message, 'Cancel failed');
					assertEquals(log, ['<start>', '</start>', '<read>', '</read>', '<read>', '<cancel>', 'closed']);
				}
				else if (c == 2)
				{	assertEquals(error?.message, 'Cancel failed');
					assertEquals(log, ['<start>', '</start>', '<read>', '</read>', '<read>', '<cancel>', 'closed', '</read>']);
				}
			}
		}
	}
);

Deno.test
(	'Reader: Start throws async',
	async () =>
	{	for (let a=0; a<2; a++) // ReadableStream or RdStream
		{	let i = 0;
			const log = new Array<string>;

			// deno-lint-ignore no-inner-declarations
			async function start()
			{	log.push('<start>');
				await new Promise(y => setTimeout(y, 50));
				throw new Error('Start failed');
			}

			// deno-lint-ignore no-inner-declarations
			async function read(view: Uint8Array)
			{	log.push('<read>');
				await new Promise(y => setTimeout(y, 10));
				view[0] = i++;
				log.push('</read>');
				return 1;
			}

			const rs = a==0 ? new ReadableStream({start, ...readToPull(read)}) : new RdStream({start, read});

			assertEquals(log, ['<start>']);

			const r = rs.getReader();
			const promise = r.read();

			assertEquals(log, ['<start>']);

			let error: Error|undefined;
			try
			{	await promise;
			}
			catch (e)
			{	error = e instanceof Error ? e : new Error(e+'');
			}
			assertEquals(error?.message, 'Start failed');
			assertEquals(log, ['<start>']);
		}
	}
);

Deno.test
(	'Reader: Start throws sync',
	() =>
	{	for (let a=0; a<2; a++) // ReadableStream or RdStream
		{	// deno-lint-ignore no-inner-declarations
			function start()
			{	throw new Error('Start failed');
			}

			// deno-lint-ignore no-inner-declarations
			function read(view: Uint8Array)
			{	view[0] = 0;
				return 1;
			}

			let error: Error|undefined;
			try
			{	a==0 ? new ReadableStream({start, ...readToPull(read)}) : new RdStream({start, read});
			}
			catch (e)
			{	error = e instanceof Error ? e : new Error(e+'');
			}
			assertEquals(error?.message, 'Start failed');
		}
	}
);

Deno.test
(	'Reader: Cancel start',
	async () =>
	{	for (let a=0; a<2; a++) // ReadableStream or RdStream
		{	let i = 0;
			const log = new Array<string>;
			let promiseStart: Promise<void> | undefined;

			// deno-lint-ignore no-inner-declarations
			async function start()
			{	log.push('<start>');
				promiseStart = new Promise(y => setTimeout(y, 50));
				await promiseStart;
				log.push('</start>');
			}

			// deno-lint-ignore no-inner-declarations
			async function read(view: Uint8Array)
			{	log.push('<read>');
				await new Promise(y => setTimeout(y, 10));
				view[0] = i++;
				log.push('</read>');
				return 1;
			}

			const rs = a==0 ? new ReadableStream({start, ...readToPull(read)}) : new RdStream({start, read, cancel() {}});

			assertEquals(log, ['<start>']);

			const r = rs.getReader();
			const promise = r.read();

			assertEquals(log, ['<start>']);

			await r.cancel();

			assertEquals(log, ['<start>']);

			const res = await promise;

			assertEquals(log, ['<start>']);

			await promiseStart;

			assertEquals(log, ['<start>', '</start>']);

			assertEquals(res, {done: true, value: undefined});
			assertEquals(log, ['<start>', '</start>']);
		}
	}
);

Deno.test
(	'Reader: Await each',
	async () =>
	{	const BUFFER_SIZE = 13;
		for (let s=0; s<2; s++) // read async, read sync
		{	for (let a=0; a<2; a++) // ReadableStream or RdStream
			{	let i = 1;
				const all = new Set<ArrayBufferLike>;

				const read = s == 0 ?
					async function(view: Uint8Array)
					{	await new Promise(y => setTimeout(y, 3 - i%3));
						assertEquals(view.byteLength, BUFFER_SIZE);
						assertEquals(view.buffer.byteLength, BUFFER_SIZE);
						all.add(view.buffer);
						for (let j=0; j<i && j<BUFFER_SIZE; j++)
						{	view[j] = i;
						}
						return Math.min(i++, BUFFER_SIZE);
					} :
					function(view: Uint8Array)
					{	assertEquals(view.byteLength, BUFFER_SIZE);
						assertEquals(view.buffer.byteLength, BUFFER_SIZE);
						all.add(view.buffer);
						for (let j=0; j<i && j<BUFFER_SIZE; j++)
						{	view[j] = i;
						}
						return Math.min(i++, BUFFER_SIZE);
					};

				const rs = a==0 ? new ReadableStream(readToPull(read)) : new RdStream({read});
				const r = rs.getReader({mode: 'byob'});
				let b = new Uint8Array(BUFFER_SIZE);
				for (let i2=1; i2<100; i2++)
				{	b = (await r.read(new Uint8Array(b.buffer, 0, b.buffer.byteLength))).value!;
					assertEquals(b.length, Math.min(i2, BUFFER_SIZE));
					for (let j=0; j<i2 && j<BUFFER_SIZE; j++)
					{	assertEquals(b[j], i2);
					}
				}
				if (a == 1)
				{	assertEquals(all.size, 1);
				}
			}
		}
	}
);

Deno.test
(	'Reader: 2 in parallel',
	async () =>
	{	const BUFFER_SIZE = 13;
		const BUFFER_SIZE_2 = 17;
		for (let s=0; s<2; s++) // read async, read sync
		{	for (let a=0; a<2; a++) // ReadableStream or RdStream
			{	let i = 1;
				const all = new Set<ArrayBufferLike>;

				const read = s == 0 ?
					async function(view: Uint8Array)
					{	await new Promise(y => setTimeout(y, 3 - i%3));
						assertEquals(view.byteLength, i%2==1 ? BUFFER_SIZE : BUFFER_SIZE_2);
						assertEquals(view.buffer.byteLength, i%2==1 ? BUFFER_SIZE : BUFFER_SIZE_2);
						all.add(view.buffer);
						for (let j=0; j<i && j<view.buffer.byteLength; j++)
						{	view[j] = i;
						}
						return Math.min(i++, view.buffer.byteLength);
					} :
					function(view: Uint8Array)
					{	assertEquals(view.byteLength, i%2==1 ? BUFFER_SIZE : BUFFER_SIZE_2);
						assertEquals(view.buffer.byteLength, i%2==1 ? BUFFER_SIZE : BUFFER_SIZE_2);
						all.add(view.buffer);
						for (let j=0; j<i && j<view.buffer.byteLength; j++)
						{	view[j] = i;
						}
						return Math.min(i++, view.buffer.byteLength);
					};

				const rs = a==0 ? new ReadableStream(readToPull(read)) : new RdStream({read});
				const r = rs.getReader({mode: 'byob'});
				let b = new Uint8Array(BUFFER_SIZE);
				let b2 = new Uint8Array(BUFFER_SIZE_2);
				for (let i2=1; i2<100; i2++)
				{	const res = r.read(new Uint8Array(b.buffer, 0, b.buffer.byteLength));
					const res2 = r.read(new Uint8Array(b2.buffer, 0, b2.buffer.byteLength));
					b = (await res).value!;
					b2 = (await res2).value!;

					assertEquals(b.length, Math.min(i2, b.buffer.byteLength));
					for (let j=0; j<i2 && j<b.buffer.byteLength; j++)
					{	assertEquals(b[j], i2);
					}

					i2++;

					assertEquals(b2.length, Math.min(i2, b2.buffer.byteLength));
					for (let j=0; j<i2 && j<b2.buffer.byteLength; j++)
					{	assertEquals(b2[j], i2);
					}
				}
				if (a == 1)
				{	assertEquals(all.size, 2);
				}
			}
		}
	}
);

Deno.test
(	'Reader: No byob',
	async () =>
	{	for (let a=0; a<2; a++) // ReadableStream or RdStream
		{	for (const BUFFER_SIZE of a==0 ? [13] : [13, 3000, 10_000])
			{	const autoAllocateMin = BUFFER_SIZE >> 3;
				let i = 1;
				const all = new Set<ArrayBufferLike>;

				// deno-lint-ignore no-inner-declarations
				async function read(view: Uint8Array)
				{	await new Promise(y => setTimeout(y, 3 - i%3));
					all.add(view.buffer);
					for (let j=0; j<i && j<autoAllocateMin; j++)
					{	view[j] = i;
					}
					return Math.min(i++, autoAllocateMin);
				}

				const rs = a==0 ? new ReadableStream(readToPull(read)) : new RdStream({autoAllocateChunkSize: BUFFER_SIZE, autoAllocateMin, read});
				const r = rs.getReader();
				for (let i2=1; i2<100; i2++)
				{	const res = r.read();
					const res2 = r.read();

					const b = (await res).value!;
					const b2 = (await res2).value!;

					assertEquals(b.length, Math.min(i2, autoAllocateMin));
					for (let j=0; j<i2 && j<autoAllocateMin; j++)
					{	assertEquals(b[j], i2);
					}

					i2++;

					assertEquals(b2.length, Math.min(i2, autoAllocateMin));
					for (let j=0; j<i2 && j<autoAllocateMin; j++)
					{	assertEquals(b2[j], i2);
					}
				}
				if (a == 1)
				{	assertEquals(all.size, BUFFER_SIZE==13 ? 8 : BUFFER_SIZE==3000 ? 2 : 1);
				}
			}
		}
	}
);

Deno.test
(	'Reader: Close, error',
	async () =>
	{	const BUFFER_SIZE = 13;
		for (let c=0; c<2; c++) // close or error
		{	for (let a=0; a<2; a++) // ReadableStream or RdStream
			{	let i = 1;
				const all = new Set<ArrayBufferLike>;

				// deno-lint-ignore no-inner-declarations
				async function read(view: Uint8Array)
				{	await new Promise(y => setTimeout(y, 3 - i%3));
					assertEquals(view.byteLength, BUFFER_SIZE);
					assertEquals(view.buffer.byteLength, BUFFER_SIZE);
					all.add(view.buffer);
					if (i == 4)
					{	if (c == 0)
						{	return null;
						}
						else
						{	throw new Error('hello all');
						}
					}
					for (let j=0; j<i && j<BUFFER_SIZE; j++)
					{	view[j] = i;
					}
					return Math.min(i++, BUFFER_SIZE);
				}

				const rs = a==0 ? new ReadableStream(readToPull(read, c==0 ? 3 : Number.MAX_SAFE_INTEGER)) : new RdStream({read});
				const r = rs.getReader({mode: 'byob'});
				let closedWith: Any;
				r.closed.then(() => {closedWith = true}, error => {closedWith = {error}});
				let b = new Uint8Array(BUFFER_SIZE);
				for (let i2=1; i2<=3; i2++)
				{	b = (await r.read(new Uint8Array(b.buffer, 0, b.buffer.byteLength))).value!;
					assertEquals(b.length, Math.min(i2, BUFFER_SIZE));
					for (let j=0; j<i2 && j<BUFFER_SIZE; j++)
					{	assertEquals(b[j], i2);
					}
				}
				assertEquals(closedWith, undefined);
				if (c == 0)
				{	const {value, done} = await r.read(new Uint8Array(b.buffer, 0, b.buffer.byteLength));
					assertEquals(closedWith, true);
					assertEquals(done, true);
					assertEquals(value instanceof Uint8Array, true);

					r.releaseLock();
					const r2 = rs.getReader();
					const res = await r2.read();
					assertEquals(res.done, true);
					assertEquals(res.value === undefined, true);
				}
				else
				{	let error: Error|undefined;
					try
					{	await r.read(new Uint8Array(b.buffer, 0, b.buffer.byteLength));
					}
					catch (e)
					{	error = e instanceof Error ? e : new Error(e+'');
					}
					assertEquals(closedWith?.error?.message, 'hello all');
					assertEquals(error?.message, 'hello all');

					r.releaseLock();
					const r2 = rs.getReader();
					error = undefined;
					try
					{	await r2.read();
					}
					catch (e)
					{	error = e instanceof Error ? e : new Error(e+'');
					}
					assertEquals(error?.message, 'hello all');
				}
				if (a == 1)
				{	assertEquals(all.size, 1);
				}
			}
		}
	}
);

Deno.test
(	'Reader: Release',
	async () =>
	{	const BUFFER_SIZE = 13;
		for (let a=0; a<2; a++) // ReadableStream or RdStream
		{	let i = 1;
			const all = new Set<ArrayBufferLike>;

			// deno-lint-ignore no-inner-declarations
			async function read(view: Uint8Array)
			{	await new Promise(y => setTimeout(y, 3 - i%3));
				assertEquals(view.byteLength, BUFFER_SIZE);
				assertEquals(view.buffer.byteLength, BUFFER_SIZE);
				all.add(view.buffer);
				for (let j=0; j<i && j<BUFFER_SIZE; j++)
				{	view[j] = i;
				}
				return Math.min(i++, BUFFER_SIZE);
			}

			const rs = a==0 ? new ReadableStream(readToPull(read)) : new RdStream({read});
			let b = new Uint8Array(BUFFER_SIZE);
			let r = rs.getReader({mode: 'byob'});
			let promise = r.read(new Uint8Array(b.buffer, 0, b.buffer.byteLength));
			const res = await promise;
			assertEquals(res, {done: false, value: new Uint8Array([1])});
			b = res.value!;
			r.releaseLock();
			try
			{	promise = r.read(new Uint8Array(b.buffer, 0, b.buffer.byteLength));
				await promise;
			}
			catch (e)
			{	assertEquals(e instanceof TypeError, true);
				assertEquals(e instanceof TypeError ? e.message : '', a==0 ? 'Reader has no associated stream.' : 'Reader or writer has no associated stream.');
			}

			r = rs.getReader({mode: 'byob'});
			promise = r.read(new Uint8Array(b.buffer, 0, b.buffer.byteLength));
			r.releaseLock();
			try
			{	await promise;
			}
			catch (e)
			{	assertEquals(e instanceof TypeError, true);
				assertEquals(e instanceof TypeError ? e.message : '', a==0 ? 'The reader was released.' : 'Reader or writer has no associated stream.');
			}

			r.releaseLock();
		}
	}
);

Deno.test
(	'Reader: Invalid usage',
	async () =>
	{	const BUFFER_SIZE = 13;
		for (let a=0; a<2; a++) // ReadableStream or RdStream
		{	let i = 1;
			const all = new Set<ArrayBufferLike>;

			// deno-lint-ignore no-inner-declarations
			async function read(view: Uint8Array)
			{	await new Promise(y => setTimeout(y, 3 - i%3));
				assertEquals(view.byteLength, BUFFER_SIZE);
				assertEquals(view.buffer.byteLength, BUFFER_SIZE);
				all.add(view.buffer);
				for (let j=0; j<i && j<BUFFER_SIZE; j++)
				{	view[j] = i;
				}
				return Math.min(i++, BUFFER_SIZE);
			}

			const rs = a==0 ? new ReadableStream(readToPull(read)) : new RdStream({read, cancel() {}});
			let b = new Uint8Array(BUFFER_SIZE);
			let r = rs.getReader({mode: 'byob'});
			try
			{	rs.getReader({mode: 'byob'});
			}
			catch (e)
			{	assertEquals(e instanceof TypeError, true);
				assertEquals(e instanceof TypeError ? e.message : '', 'ReadableStream is locked');
			}
			r.releaseLock();

			r = rs.getReader({mode: 'byob'});
			let res = await r.read(new Uint8Array(b.buffer, 0, b.buffer.byteLength));
			assertEquals(res, {done: false, value: new Uint8Array([1])});
			b = res.value!;

			try
			{	await rs.cancel();
			}
			catch (e)
			{	assertEquals(e instanceof TypeError, true);
				assertEquals(e instanceof TypeError ? e.message : '', 'Cannot cancel a locked ReadableStream.');
			}
			r.releaseLock();

			await rs.cancel();

			r = rs.getReader({mode: 'byob'});
			res = await r.read(new Uint8Array(b.buffer, 0, b.buffer.byteLength));
			assertEquals(res.done, true);
		}
	}
);

Deno.test
(	'Reader: Tee and read in parallel',
	async () =>
	{	const BUFFER_SIZE = 13;
		for (let c=0; c<4; c++) // 0: no cancel, 1: cancel first, 2: cancel second, 3: cancel both
		{	for (let a=0; a<3; a++) // 0: ReadableStream, 1: RdStream, 2: RdStream with requireParallelRead
			{	let i = 1;
				const all = new Set<ArrayBufferLike>;
				const iAllocated = new Set<ArrayBufferLike>;
				const log = new Array<string>;
				let completeCancel: VoidFunction|undefined;

				// deno-lint-ignore no-inner-declarations
				async function read(view: Uint8Array)
				{	await new Promise(y => setTimeout(y, 3 - i%3));
					assertEquals(view.byteLength, BUFFER_SIZE);
					assertEquals(view.buffer.byteLength, BUFFER_SIZE);
					all.add(view.buffer);
					for (let j=0; j<i && j<BUFFER_SIZE; j++)
					{	view[j] = i;
					}
					if (i > 100)
					{	return null;
					}
					return Math.min(i++, BUFFER_SIZE);
				}

				// deno-lint-ignore no-inner-declarations
				async function cancel()
				{	log.push('cancel begin');
					await new Promise<void>(y => {completeCancel = y});
					log.push('cancel end');
				}

				const rs = a==0 ? new ReadableStream({...readToPull(read, 100), cancel}) : new RdStream({read, cancel});

				await Promise.all
				(	(rs instanceof RdStream && a==2 ? rs.tee({requireParallelRead: true}) : rs.tee()).map
					(	async (rs, nRs) =>
						{	const r = rs.getReader({mode: 'byob'});

							let b = new Uint8Array(BUFFER_SIZE);
							iAllocated.add(b.buffer);
							for (let i2=1; i2<=100; i2++)
							{	const promise = r.read(new Uint8Array(b.buffer, 0, b.buffer.byteLength));
								const wantCancel = nRs==0 && (c==1 || c==3) && i2==50 || nRs==1 && (c==2 || c==3) && i2==60;
								if (wantCancel)
								{	log.push('want cancel '+nRs);
									r.cancel();
									log.push('cancel called '+nRs);
								}
								const res = await promise;
								b = res.value!;
								if (wantCancel)
								{	log.push('cancelled '+nRs);
									assertEquals(res.value == undefined, a == 0);
									assertEquals(res.done, true);
									if (a == 0)
									{	// the buffer is detached
										b = new Uint8Array(BUFFER_SIZE);
									}
									break;
								}
								assertEquals(b.length, Math.min(i2, BUFFER_SIZE));
								for (let j=0; j<i2 && j<BUFFER_SIZE; j++)
								{	assertEquals(b[j], i2);
								}
							}

							const {value, done} = await r.read(new Uint8Array(b.buffer, 0, b.buffer.byteLength));
							assertEquals(done, true);
							assertEquals(value instanceof Uint8Array, true);
							r.releaseLock();

							const r2 = rs.getReader();
							const res = await r2.read();
							assertEquals(res.done, true);
						}
					)
				);

				if (a >= 1)
				{	for (const b of iAllocated)
					{	all.delete(b);
					}
					assertEquals(all.size, 0);
				}

				if (c == 1)
				{	assertEquals(log, ['want cancel 0', 'cancel called 0', 'cancelled 0']);
				}
				else if (c == 2)
				{	assertEquals(log, ['want cancel 1', 'cancel called 1', 'cancelled 1']);
				}
				else if (c == 3)
				{	assertEquals(log, ['want cancel 0', 'cancel called 0', 'cancelled 0', 'want cancel 1', 'cancel begin', 'cancel called 1', 'cancelled 1']);
				}
				completeCancel?.();
				await new Promise(y => setTimeout(y, 1));
				if (c == 1)
				{	assertEquals(log, ['want cancel 0', 'cancel called 0', 'cancelled 0']);
				}
				else if (c == 2)
				{	assertEquals(log, ['want cancel 1', 'cancel called 1', 'cancelled 1']);
				}
				else if (c == 3)
				{	assertEquals(log, ['want cancel 0', 'cancel called 0', 'cancelled 0', 'want cancel 1', 'cancel begin', 'cancel called 1', 'cancelled 1', 'cancel end']);
				}
			}
		}
	}
);

Deno.test
(	'Reader: Tee and read one after another',
	async () =>
	{	const BUFFER_SIZE = 13;
		for (let c=0; c<4; c++) // 0: no cancel, 1: cancel first, 2: cancel second, 3: cancel both
		{	for (let a=0; a<2; a++) // ReadableStream or RdStream
			{	let i = 1;
				const all = new Set<ArrayBufferLike>;
				let timer;

				// deno-lint-ignore no-inner-declarations
				async function read(view: Uint8Array)
				{	await new Promise(y => timer = setTimeout(y, 3 - i%3));
					all.add(view.buffer);
					for (let j=0; j<i && j<BUFFER_SIZE; j++)
					{	view[j] = i;
					}
					if (i > 100)
					{	return null;
					}
					return Math.min(i++, BUFFER_SIZE);
				}

				const rs = a==0 ? new ReadableStream(readToPull(read, 100)) : new RdStream({read});
				const [rs1, rs2] = rs.tee();

				// rs1
				const r1 = rs1.getReader({mode: 'byob'});

				let b = new Uint8Array(BUFFER_SIZE);
				let totalLen = 0;
				for (let i2=1; i2<=100; i2++)
				{	for (let j=0; j<i2 && j<BUFFER_SIZE; j++)
					{	totalLen++;
					}
				}
				for (let i2=1; i2<=100; i2++)
				{	const promise = r1.read(new Uint8Array(b.buffer, 0, b.buffer.byteLength));
					if ((c==1 || c==3) && i2==60)
					{	r1.cancel();
					}
					const res = await promise;
					b = res.value!;
					if ((c==1 || c==3) && i2==60)
					{	assertEquals(res.value == undefined, a == 0);
						assertEquals(res.done, true);
						if (a == 0)
						{	// the buffer is detached
							b = new Uint8Array(BUFFER_SIZE);
						}
						break;
					}
					assertEquals(b.length, Math.min(i2, BUFFER_SIZE));
					for (let j=0; j<i2 && j<BUFFER_SIZE; j++)
					{	assertEquals(b[j], i2);
					}
				}

				const {value, done} = await r1.read(new Uint8Array(b.buffer, 0, b.buffer.byteLength));
				assertEquals(done, true);
				assertEquals(value instanceof Uint8Array, true);
				r1.releaseLock();

				const r12 = rs1.getReader();
				const res = await r12.read();
				assertEquals(res.done, true);

				// rs2
				const r2 = rs2.getReader({mode: 'byob'});
				if (c==2 || c==3)
				{	totalLen = 111;
				}
				let b2 = new Uint8Array(totalLen);
				let b2Offset = 0
				while (b2Offset < totalLen)
				{	const res2 = await r2.read(b2.subarray(b2Offset));
					assertEquals(res2.done, false);
					const nRead = res2.value?.byteLength ?? 0;
					assertEquals(nRead > 0, true);
					b2 = new Uint8Array(res2.value!.buffer);
					b2Offset += nRead;
				}
				assertEquals(b2Offset, totalLen);
				all.delete(b2.buffer);
				let k = 0;
				for (let i2=1; i2<=100; i2++)
				{	for (let j=0; j<i2 && j<BUFFER_SIZE; j++)
					{	if ((c==2 || c==3) && k>=totalLen)
						{	r2.cancel();
							break;
						}
						assertEquals(b2[k++], i2);
					}
				}
				assertEquals(k, totalLen);
				r2.releaseLock();

				// a
				if (a >= 1)
				{	assertEquals(all.size, 1);
				}

				const r22 = rs2.getReader();
				const res2 = await r22.read();
				assertEquals(res2.done, true);

				clearTimeout(timer);
			}
		}
	}
);

Deno.test
(	'PipeTo',
	async () =>
	{	const src = new Uint8Array(3000);
		for (let i=0; i<src.byteLength; i++)
		{	src[i] = Math.floor(Math.random() * 255);
		}
		for (let s=0; s<2; s++) // async write, sync write
		{	for (let p=0; p<2; p++) // without pipeThrough, with pipeThrough
			{	for (let a=0; a<2; a++) // ReadableStream or RdStream
				{	for (let a2=0; a2<2; a2++) // WritableStream or WrStream
					{	const dest = new Uint8Array(src.byteLength);
						let srcPos = 0;
						let destPos = 0;
						const all = new Set<ArrayBufferLike>;

						const read = async function(view: Uint8Array)
						{	await new Promise(y => setTimeout(y, 3 - srcPos/3%3));
							all.add(view.buffer);
							if (srcPos == src.byteLength)
							{	return null;
							}
							const n = Math.min(view.byteLength, src.byteLength-srcPos, Math.floor(Math.random() * src.byteLength/10) + 1);
							view.set(src.subarray(srcPos, srcPos+n));
							srcPos += n;
							return n;
						};

						const write = s == 0 ?
							async function(chunk: Uint8Array)
							{	await new Promise(y => setTimeout(y, 3 - destPos/3%3));
								const n = chunk.byteLength<=src.byteLength/20 ? chunk.byteLength : Math.ceil(Math.random() * chunk.byteLength);
								dest.set(chunk.subarray(0, n), destPos);
								destPos += n;
								return n;
							} :
							function(chunk: Uint8Array)
							{	const n = chunk.byteLength<=src.byteLength/20 ? chunk.byteLength : Math.ceil(Math.random() * chunk.byteLength);
								dest.set(chunk.subarray(0, n), destPos);
								destPos += n;
								return n;
							};

						const rs: ReadableStream<Uint8Array> = a==0 ? new ReadableStream(readToPull(read, 3*1024)) : new RdStream({read});
						const ws = a2==0 ? new WritableStream(writeToWrite(write)) : new WrStream({write});
						assertEquals(rs.locked, false);
						assertEquals(ws.locked, false);

						let useRs = rs;
						if (p == 1)
						{	useRs = rs.pipeThrough<Uint8Array>
							(	new TrStream
								(	{	async transform(writer, chunk)
										{	for (let i=0; i<chunk.length; i++)
											{	chunk[i] = ~chunk[i];
											}
											await writer.write(chunk);
											return chunk.length;
										}
									}
								)
							);
						}

						await useRs.pipeTo(ws);

						assertEquals(rs.locked, false);
						assertEquals(ws.locked, false);
						assertEquals(dest, p==0 ? src : src.map(b => ~b));
					}
				}
			}
		}
	}
);

Deno.test
(	'Reader: Big data',
	async () =>
	{	for (let a=0; a<3; a++) // ReadableStream, new RdStream, RdStream.from()
		{	const SEND_N_BYTES = 10_000_000;
			const CHUNK_SIZE = 1000;
			const N_IN_PARALLEL = 10;
			await using sender = createTcpServer
			(	async conn =>
				{	const writer = conn.writable.getWriter();
					const buffer = new Uint8Array(CHUNK_SIZE);
					let i = 0;
					while (i < SEND_N_BYTES)
					{	let j = 0;
						while (j<buffer.length && i<SEND_N_BYTES)
						{	buffer[j++] = i++ & 0xFF;
						}
						await writer.write(buffer.subarray(0, j));
					}
					await writer.close();
				}
			);
			let nBytes = 0;
			const all = new Set<ArrayBuffer>;
			const startTime = Date.now();
			await Promise.all
			(	new Array(N_IN_PARALLEL).fill(0).map
				(	async () =>
					{	const fh = await connectWithRetry(sender.port);
						const rs = a==0 ? fh.readable : a==1 ? RdStream.from(fh.readable) : new RdStream(fh);

						const reader = rs.getReader({mode: 'byob'});
						let i = 0;
						let buffer = new Uint8Array(32*1024);
						while (true)
						{	const {value, done} = await reader.read(buffer);
							if (value)
							{	for (let j=0; j<value.byteLength; j++)
								{	if (value[j] != (i++ & 0xFF))
									{	throw new Error(`Invalid value at ${i-1}`);
									}
								}
								nBytes += value.byteLength;
								all.add(value.buffer);
								buffer = new Uint8Array(value.buffer);
							}
							if (done)
							{	break;
							}
						}
					}
				)
			);
			console.log((a==0 ? 'Use `deno run` (not `deno test`) to get real numbes.\nReadableStream: time ' : a==1 ? 'RdStream.from(ReadableStream): time ' : 'new RdStream(Deno.Reader): ') + (Date.now() - startTime)/1000 + 'sec');
			assertEquals(nBytes, SEND_N_BYTES*N_IN_PARALLEL);
			if (a >= 1)
			{	assertEquals(all.size, N_IN_PARALLEL);
			}
		}
	}
);

Deno.test
(	'Reader: Big data pipeThrough',
	async () =>
	{	for (let a=0; a<3; a++) // ReadableStream, new RdStream, RdStream.from()
		{	const SEND_N_BYTES = 10_000_000;
			const CHUNK_SIZE = 1000;
			const N_IN_PARALLEL = 10;
			await using sender = createTcpServer
			(	async conn =>
				{	const writer = conn.writable.getWriter();
					const buffer = new Uint8Array(CHUNK_SIZE);
					let i = 0;
					while (i < SEND_N_BYTES)
					{	let j = 0;
						while (j<buffer.length && i<SEND_N_BYTES)
						{	buffer[j++] = i++ & 0xFF;
						}
						await writer.write(buffer.subarray(0, j));
					}
					await writer.close();
				}
			);
			let nBytes = 0;
			let nIters = 0;
			const all = new Set<ArrayBuffer>;
			const startTime = Date.now();
			await Promise.all
			(	new Array(N_IN_PARALLEL).fill(0).map
				(	async () =>
					{	const fh = await connectWithRetry(sender.port);
						if (a == 0)
						{	const rs = fh.readable.pipeThrough
							(	new TransformStream
								(	{	transform(chunk, controller)
										{	for (let i=0; i<chunk.length; i++)
											{	chunk[i] = ~chunk[i] & 0xFF;
											}
											controller.enqueue(chunk);
										}
									}
								)
							);

							const reader = rs.getReader();
							let i = 0;
							while (true)
							{	nIters++;
								const {value, done} = await reader.read();
								if (value)
								{	for (let j=0; j<value.byteLength; j++)
									{	if (value[j] != (~i++ & 0xFF))
										{	throw new Error(`Invalid value at ${i-1}`);
										}
									}
									nBytes += value.byteLength;
									all.add(value.buffer);
								}
								if (done)
								{	break;
								}
							}
						}
						else
						{	const rs = (a==1 ? RdStream.from(fh.readable) : new RdStream(fh)).pipeThrough
							(	new TrStream
								(	{	async transform(writer, chunk)
										{	for (let i=0; i<chunk.length; i++)
											{	chunk[i] = ~chunk[i] & 0xFF;
											}
											await writer.write(chunk);
											return chunk.length;
										}
									}
								)
							);

							const reader = rs.getReader({mode: 'byob'});
							let i = 0;
							const buffer = new Uint8Array(32*1024);
							while (true)
							{	nIters++;
								const {value, done} = await reader.read(buffer);
								if (value)
								{	for (let j=0; j<value.byteLength; j++)
									{	if (value[j] != (~i++ & 0xFF))
										{	throw new Error(`Invalid value at ${i-1}`);
										}
									}
									nBytes += value.byteLength;
									all.add(value.buffer);
								}
								if (done)
								{	break;
								}
							}
						}
					}
				)
			);
			console.log((a==0 ? 'Use `deno run` (not `deno test`) to get real numbes.\nReadableStream: time ' : a==1 ? 'RdStream.from(ReadableStream): time ' : 'new RdStream(Deno.Reader): ') + (Date.now() - startTime)/1000 + 'sec');
			assertEquals(nBytes, SEND_N_BYTES*N_IN_PARALLEL);
			if (a >= 1)
			{	assertEquals(all.size, N_IN_PARALLEL);
			}
		}
	}
);

Deno.test
(	'Transform: close writer',
	async () =>
	{	const PART_SIZE = 100_000;
		const N_PARTS = 4;
		const CHUNK_SIZE = 1000;
		await using sender = createTcpServer
		(	async conn =>
			{	const writer = conn.writable.getWriter();
				const buffer = new Uint8Array(CHUNK_SIZE);
				let i = 0;
				const iEnd = PART_SIZE*N_PARTS;
				while (i < iEnd)
				{	let j = 0;
					while (j<buffer.length && i<iEnd)
					{	buffer[j++] = i++ & 0xFF;
					}
					await writer.write(buffer.subarray(0, j));
				}
				await writer.close();
			}
		);
		const fh = await connectWithRetry(sender.port);
		const rs = new RdStream(fh);
		const parts = new Array<Uint8Array>;
		while (true)
		{	let i2 = 0;
			using reader = await rs.getReaderWhenReady();
			const part = await reader.pipeThrough
			(	new TrStream
				(	{	async transform(writer, chunk)
						{	let i = 0;
							for (; i<chunk.length && i2<PART_SIZE; i++, i2++)
							{	chunk[i] = ~chunk[i] & 0xFF;
							}
							await writer.write(chunk.subarray(0, i));
							if (i2 >= PART_SIZE)
							{	await writer.close();
							}
							return i;
						}
					}
				)
			).bytes();
			if (part.byteLength == 0)
			{	break;
			}
			parts.push(part);
		}
		assertEquals(parts.length, N_PARTS);
		let i = 0;
		for (const part of parts)
		{	for (let j=0; j<part.byteLength; j++)
			{	if (part[j] != (~i++ & 0xFF))
				{	throw new Error(`Invalid value at ${i-1}`);
				}
			}
		}
	}
);

Deno.test
(	'Transform: grow buffer',
	async () =>
	{	const GEN_CHUNK_SIZE = 2733;
		const CONSUME_CHUNK_SIZE = 64*1024;
		const DATA = textEncoder.encode('Hello'.repeat(CONSUME_CHUNK_SIZE));
		for (let a=0; a<2; a++) // ReadableStream or RdStream
		{	await using sender = createTcpServer
			(	async conn =>
				{	const ws = new WrStream(conn);
					let data = DATA;
					while (data.byteLength)
					{	await ws.write(data.subarray(0, GEN_CHUNK_SIZE));
						data = data.subarray(GEN_CHUNK_SIZE);
						await new Promise(y => setTimeout(y, 2));
					}
					await ws.close();
				}
			);
			const fh = await connectWithRetry(sender.port);
			const rs: ReadableStream<Uint8Array> = a==0 ?
				fh.readable :
				new RdStream
				(	{	autoAllocateChunkSize: CONSUME_CHUNK_SIZE,
						read: p => fh.read(p),
						close: () => fh.close(),
					}
				);
			const observedSizes = new Array<number>;
			const transformed = await RdStream.from
			(	rs.pipeThrough
				(	new TrStream
					(	{	async transform(writer, chunk, canReturnZero)
							{	observedSizes.push(chunk.buffer.byteLength);
								if (canReturnZero)
								{	return 0;
								}
								assertEquals(chunk.byteLength, DATA.byteLength);
								await writer.write(chunk);
								return chunk.byteLength;
							}
						}
					)
				)
			).bytes();
			assertEquals(transformed, DATA);
			if (a == 1)
			{	assertEquals(observedSizes[0], CONSUME_CHUNK_SIZE);
				assertEquals(observedSizes.includes(CONSUME_CHUNK_SIZE*2), true);
			}
		}
	}
);

Deno.test
(	'Reader: bytes()',
	async () =>
	{	for (let a=0; a<2; a++) // autoAllocateChunkSize: default, explicit
		{	for (const SEND_N_BYTES of [0, 10, 10_000_000])
			{	const CHUNK_SIZE = 1000;
				await using sender = createTcpServer
				(	async conn =>
					{	const writer = conn.writable.getWriter();
						const buffer = new Uint8Array(CHUNK_SIZE);
						let i = 0;
						while (i < SEND_N_BYTES)
						{	let j = 0;
							while (j<buffer.length && i<SEND_N_BYTES)
							{	buffer[j++] = i++ & 0xFF;
							}
							await writer.write(buffer.subarray(0, j));
						}
						await writer.close();
					}
				);
				const fh = await connectWithRetry(sender.port);
				const value = await new RdStream(a==0 ? fh : {read: v => fh.read(v), close: () => fh.close(), autoAllocateChunkSize: 100}).bytes();
				for (let i=0; i<value.byteLength; i++)
				{	if (value[i] != (i & 0xFF))
					{	throw new Error(`Invalid value at ${i}`);
					}
				}
			}
		}
	}
);

Deno.test
(	'Reader: Iterator',
	async () =>
	{	const BUFFER_SIZE = 13;
		let i = 1;
		const all = new Set<ArrayBufferLike>;
		let timer;
		const rs = new RdStream
		(	{	autoAllocateMin: BUFFER_SIZE,

				async read(view)
				{	await new Promise(y => timer = setTimeout(y, 3 - i%3));
					assertEquals(view.byteLength >= BUFFER_SIZE, true);
					all.add(view.buffer);
					for (let j=0; j<i && j<BUFFER_SIZE; j++)
					{	view[j] = i;
					}
					return Math.min(i++, BUFFER_SIZE);
				}
			}
		);

		assertEquals(rs.locked, false);
		let i2 = 1;
		for await (const b of rs)
		{	assertEquals(b.length, Math.min(i2, BUFFER_SIZE));
			for (let j=0; j<i2 && j<BUFFER_SIZE; j++)
			{	assertEquals(b[j], i2);
			}
			i2++;
			if (i2 == 100)
			{	break;
			}
		}
		assertEquals(rs.locked, false);

		assertEquals(all.size, 1);

		clearTimeout(timer);
	}
);

Deno.test
(	'Reader: From iterator',
	async () =>
	{	for (let s=0; s<5; s++) // sync iter of value, sync iter of promise, async iter, ReadableStream, ReadableStream bytes
		{	for (let a=0; a<2; a++) // ReadableStream or RdStream
			{	let i = 1;
				const src =
					s == 0 ?
						[new Uint8Array([1, 1]), new Uint8Array([2, 2]), new Uint8Array([3, 3])] :
					s == 1 ?
						[Promise.resolve(new Uint8Array([1, 1])), Promise.resolve(new Uint8Array([2, 2])), Promise.resolve(new Uint8Array([3, 3]))] :
					s == 2 ?
						(	async function *()
							{	yield new Uint8Array([1, 1]);
								yield new Uint8Array([2, 2]);
								yield new Uint8Array([3, 3]);
							}
						)() :
					s == 3 ?
						ReadableStream.from([new Uint8Array([1, 1]), new Uint8Array([2, 2]), new Uint8Array([3, 3])]) :
						new ReadableStream
						(	{	type: 'bytes',
								pull(controller)
								{	const view = controller.byobRequest?.view;
									if (view)
									{	const view2 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
										view2[0] = i;
										view2[1] = i;
										controller.byobRequest.respond(2);
									}
									else
									{	controller.enqueue(new Uint8Array([i, i]));
									}
									if (++i == 4)
									{	controller.close();
									}
								}
							}
						);
				const rs = (a==0 ? ReadableStream : RdStream).from(src);
				let i2 = 1;
				for await (const item of rs)
				{	assertEquals(item, new Uint8Array([i2, i2]));
					i2++;
				}
				assertEquals(i2, 4);
			}
		}
	}
);

Deno.test
(	'pipeThrough: restart + unread',
	async () =>
	{	for (let a=0; a<3; a++)
		{	const sink = new StringSink;
			const tokens = new StringStreamer('One Two Three Four');
			if (a >= 1)
			{	tokens.unread(textEncoder.encode('Zero '));
			}
			if (a >= 2)
			{	tokens.unread(textEncoder.encode('-One '));

				await tokens.pipeThrough(new CopyOneToken).pipeTo(sink, {preventClose: true});
				assertEquals(sink.value, '-One');
				sink.value = '';
			}
			if (a >= 1)
			{	await tokens.pipeThrough(new CopyOneToken).pipeTo(sink, {preventClose: true});
				assertEquals(sink.value, 'Zero');
				sink.value = '';
			}
			await tokens.pipeThrough(new CopyOneToken).pipeTo(sink, {preventClose: true});
			assertEquals(sink.value, 'One');
			await tokens.pipeThrough(new CopyOneToken).pipeTo(sink, {preventClose: true});
			assertEquals(sink.value, 'OneTwo');
			const rest = await tokens.text();
			assertEquals(rest, 'Three Four');
			await sink.close();
		}
	}
);

Deno.test
(	'unread',
	async () =>
	{	const buffer = new Uint8Array(8);
		for (let a=0; a<3; a++)
		{	for (let b=0; b<2; b++)
			{	const tokens = new StringStreamer('One Two Three Four');
				if (a >= 1)
				{	tokens.unread(textEncoder.encode('Zero '));
				}
				if (a >= 2)
				{	tokens.unread(textEncoder.encode('-One '));
				}
				let text = '';
				if (b == 0)
				{	using reader = tokens.getReader();
					while (true)
					{	const {done, value} = await reader.read();
						if (done)
						{	break;
						}
						text += textDecoder.decode(value);
					}
				}
				else
				{	using reader = tokens.getReader({mode: 'byob'});
					while (true)
					{	const {done, value} = await reader.read(buffer);
						if (done)
						{	break;
						}
						text += textDecoder.decode(value);
					}
				}
				assertEquals(text, a==0 ? 'One Two Three Four' : a==1 ? 'Zero One Two Three Four' : '-One Zero One Two Three Four');
			}
		}
	}
);

Deno.test
(	'Read through Response object',
	async () =>
	{	for (let a=0; a<2; a++) // ReadableStream or RdStream
		{	for (const limit of [1, 10, 100, 1000, Number.MAX_SAFE_INTEGER])
			{	let lor = textEncoder.encode(LOR);

				// deno-lint-ignore no-inner-declarations
				function read(view: Uint8Array)
				{	if (lor.byteLength == 0)
					{	return null;
					}
					const nRead = Math.min(lor.byteLength, view.byteLength, limit);
					view.set(lor.subarray(0, nRead));
					lor = lor.subarray(nRead);
					return nRead;
				}

				const rs = a==0 ? new ReadableStream({...readToPull(read)}) : new RdStream({read});
				const resp = new Response(rs);
				const text = await resp.text();
				assertEquals(text, LOR);
			}
		}
	}
);

Deno.test
(	'Read min',
	async () =>
	{	for (let a=0; a<2; a++) // ReadableStream or RdStream
		{	let lor = textEncoder.encode(LOR);
			let limit = Number.MAX_SAFE_INTEGER;
			let nCalled = 0;

			// deno-lint-ignore no-inner-declarations
			function read(view: Uint8Array)
			{	nCalled++;
				if (lor.byteLength == 0)
				{	return null;
				}
				const nRead = Math.min(lor.byteLength, view.byteLength, limit);
				view.set(lor.subarray(0, nRead));
				lor = lor.subarray(nRead);
				return nRead;
			}

			const rs = a==0 ? new ReadableStream({...readToPull(read)}) : new RdStream({read});
			const r = rs.getReader({mode: 'byob'});

			try
			{	let b = new Uint8Array(lor.byteLength);

				// Read first 30 bytes
				limit = 10;
				const {value, done} = await r.read(b, {min: 25});
				assertEquals(done, false);
				assert(value);
				b = new Uint8Array(value.buffer, 0, value.buffer.byteLength);
				assertEquals(value.byteLength, 30);
				assertEquals(textDecoder.decode(value), LOR.slice(0, 30));
				assertEquals(nCalled, 3);

				// Read the rest
				limit = Number.MAX_SAFE_INTEGER;
				const {value: value2, done: done2} = await r.read(b);
				assertEquals(done2, false);
				assert(value2);
				b = new Uint8Array(value2.buffer, 0, value2.buffer.byteLength);
				assertEquals(textDecoder.decode(value2), LOR.slice(30));
				assertEquals(nCalled, 4);

				// Read at EOF
				if (a==1 || !DENO_READER_HAS_BUG_1)
				{	const {done: done3} = await r.read(b);
					assertEquals(done3, true);
					assertEquals(nCalled, 5);
				}
			}
			finally
			{	r.releaseLock();
			}
		}
	}
);

Deno.test
(	'Read min, request more than available',
	async () =>
	{	for (let a=0; a<2; a++) // ReadableStream or RdStream
		{	let lor = textEncoder.encode(LOR);
			let limit = Number.MAX_SAFE_INTEGER;
			let nCalled = 0;

			// deno-lint-ignore no-inner-declarations
			function read(view: Uint8Array)
			{	nCalled++;
				if (lor.byteLength == 0)
				{	return null;
				}
				const nRead = Math.min(lor.byteLength, view.byteLength, limit);
				view.set(lor.subarray(0, nRead));
				lor = lor.subarray(nRead);
				return nRead;
			}

			const rs = a==0 ? new ReadableStream({...readToPull(read)}) : new RdStream({read});
			const r = rs.getReader({mode: 'byob'});

			try
			{	let b = new Uint8Array(lor.byteLength);

				// Read first 30 bytes
				limit = 10;
				const {value, done} = await r.read(b, {min: 25});
				assertEquals(done, false);
				assert(value);
				b = new Uint8Array(value.buffer, 0, value.buffer.byteLength);
				assertEquals(value.byteLength, 30);
				assertEquals(textDecoder.decode(value), LOR.slice(0, 30));
				assertEquals(nCalled, 3);

				// Read the rest
				if (a==1 || !DENO_READER_HAS_BUG_2)
				{	limit = Number.MAX_SAFE_INTEGER;
					const {value: value2, done: done2} = await r.read(b, {min: b.byteLength});
					assertEquals(done2, true);
					assert(value2);
					b = new Uint8Array(value2.buffer, 0, value2.buffer.byteLength);
					assertEquals(textDecoder.decode(value2), LOR.slice(30));
					assertEquals(nCalled, 5);
				}
			}
			finally
			{	r.releaseLock();
			}
		}
	}
);

Deno.test
(	'Writer',
	async () =>
	{	for (let a=0; a<2; a++) // WritableStream or WrStream
		{	let src = new Uint8Array(3*1024);
			for (let i=0; i<src.byteLength; i++)
			{	src[i] = Math.floor(Math.random() * 255);
			}
			const dest = new Uint8Array(src.byteLength);
			let destLen = 0;

			// deno-lint-ignore no-inner-declarations
			async function write(chunk: Uint8Array)
			{	await new Promise(y => setTimeout(y, 3 - destLen/3%3));
				assertEquals(chunk.buffer.byteLength, src.buffer.byteLength);
				let i = 0;
				for (; i<3 && i<chunk.byteLength; i++)
				{	dest[destLen++] = chunk[i];
				}
				return i;
			}

			const ws = a==0 ? new WritableStream(writeToWrite(write)) : new WrStream({write});
			assertEquals(ws.locked, false);
			const w = ws.getWriter();
			while (src.byteLength > 0)
			{	const copyLen = Math.floor(Math.random() * 255);
				await w.write(src.subarray(0, copyLen));
				src = src.subarray(copyLen);
			}
			src = new Uint8Array(src.buffer);
			assertEquals(src, dest);

			await w.close();
			let error;
			try
			{	await w.write(src.subarray(0, 10));
			}
			catch (e)
			{	error = e;
			}
			assertEquals(error instanceof TypeError, true);
		}
	}
);

Deno.test
(	'Writer: flush',
	async () =>
	{	const log = new Array<string>;
		const ws = new WrStream
		(	{	write(chunk)
				{	log.push(`write(${textDecoder.decode(chunk)})`);
					return chunk.byteLength;
				},
				flush()
				{	log.push('flush');
				},
				close()
				{	log.push('close');
				}
			}
		);
		await ws.write('Text');
		await ws.flush();
		await ws.close();
		assertEquals(log, ['write(Text)', 'flush', 'close']);
	}
);

Deno.test
(	'Reader: throwAfterCancel - default behavior (false)',
	async () =>
	{	let lor = textEncoder.encode(LOR);

		function read(view: Uint8Array)
		{	if (lor.byteLength == 0)
			{	return null;
			}
			const nRead = Math.min(lor.byteLength, view.byteLength, 10);
			view.set(lor.subarray(0, nRead));
			lor = lor.subarray(nRead);
			return nRead;
		}

		// Default behavior: throwAfterCancel is false
		const rs = new RdStream({read});
		using reader = rs.getReader();

		// Read some data
		const {value: firstChunk} = await reader.read();
		assertEquals(firstChunk?.byteLength, 10);

		// Cancel the stream
		await reader.cancel('User canceled');

		// After cancel, read should return EOF without throwing
		const {value, done} = await reader.read();
		assertEquals(done, true);
		assertEquals(value, undefined);

		// Multiple reads should continue to return EOF
		const {value: value2, done: done2} = await reader.read();
		assertEquals(done2, true);
		assertEquals(value2, undefined);
	}
);

Deno.test
(	'Reader: throwAfterCancel - throws on read after cancel',
	async () =>
	{	let lor = textEncoder.encode(LOR);

		function read(view: Uint8Array)
		{	if (lor.byteLength == 0)
			{	return null;
			}
			const nRead = Math.min(lor.byteLength, view.byteLength, 10);
			view.set(lor.subarray(0, nRead));
			lor = lor.subarray(nRead);
			return nRead;
		}

		// Enable throwAfterCancel
		const rs = new RdStream({throwAfterCancel: true, read});
		using reader = rs.getReader();

		// Read some data
		const {value: firstChunk} = await reader.read();
		assertEquals(firstChunk?.byteLength, 10);

		// Cancel the stream
		await reader.cancel('User canceled');

		// After cancel, read should throw
		let error: Error|undefined;
		try
		{	await reader.read();
		}
		catch (e)
		{	error = e instanceof Error ? e : new Error(e+'');
		}
		assertEquals(error?.message, 'Stream was canceled');

		// Multiple read attempts should continue to throw
		error = undefined;
		try
		{	await reader.read();
		}
		catch (e)
		{	error = e instanceof Error ? e : new Error(e+'');
		}
		assertEquals(error?.message, 'Stream was canceled');
	}
);

Deno.test
(	'Reader: throwAfterCancel - BYOB mode',
	async () =>
	{	let lor = textEncoder.encode(LOR);

		function read(view: Uint8Array)
		{	if (lor.byteLength == 0)
			{	return null;
			}
			const nRead = Math.min(lor.byteLength, view.byteLength, 10);
			view.set(lor.subarray(0, nRead));
			lor = lor.subarray(nRead);
			return nRead;
		}

		// Enable throwAfterCancel
		const rs = new RdStream({throwAfterCancel: true, read});
		using reader = rs.getReader({mode: 'byob'});

		// Read some data
		const buffer1 = new Uint8Array(20);
		const {value: firstChunk} = await reader.read(buffer1);
		assertEquals(firstChunk?.byteLength, 10);

		// Cancel the stream
		await reader.cancel('User canceled');

		// After cancel, BYOB read should throw
		const buffer2 = new Uint8Array(20);
		let error: Error|undefined;
		try
		{	await reader.read(buffer2);
		}
		catch (e)
		{	error = e instanceof Error ? e : new Error(e+'');
		}
		assertEquals(error?.message, 'Stream was canceled');
	}
);

Deno.test
(	'Reader: throwAfterCancel - with read min option',
	async () =>
	{	let lor = textEncoder.encode(LOR);

		function read(view: Uint8Array)
		{	if (lor.byteLength == 0)
			{	return null;
			}
			const nRead = Math.min(lor.byteLength, view.byteLength, 5);
			view.set(lor.subarray(0, nRead));
			lor = lor.subarray(nRead);
			return nRead;
		}

		// Enable throwAfterCancel
		const rs = new RdStream({throwAfterCancel: true, read});
		using reader = rs.getReader({mode: 'byob'});

		// Read some data with min option
		const buffer1 = new Uint8Array(20);
		const {value: firstChunk} = await reader.read(buffer1, {min: 10});
		assertEquals(firstChunk && firstChunk.byteLength >= 10, true);

		// Cancel the stream
		await reader.cancel('User canceled');

		// After cancel, read with min should throw
		const buffer2 = new Uint8Array(20);
		let error: Error|undefined;
		try
		{	await reader.read(buffer2, {min: 10});
		}
		catch (e)
		{	error = e instanceof Error ? e : new Error(e+'');
		}
		assertEquals(error?.message, 'Stream was canceled');
	}
);

Deno.test
(	'Reader: throwAfterCancel - normal close (no cancel)',
	async () =>
	{	let lor = textEncoder.encode('Short');

		function read(view: Uint8Array)
		{	if (lor.byteLength == 0)
			{	return null;
			}
			const nRead = Math.min(lor.byteLength, view.byteLength);
			view.set(lor.subarray(0, nRead));
			lor = lor.subarray(nRead);
			return nRead;
		}

		// Enable throwAfterCancel - but we won't cancel, we'll read to end
		const rs = new RdStream({throwAfterCancel: true, read});
		using reader = rs.getReader();

		// Read all data
		const {value: firstChunk} = await reader.read();
		assertEquals(textDecoder.decode(firstChunk), 'Short');

		// Read at EOF - should return EOF, not throw (stream closed normally)
		const {value, done} = await reader.read();
		assertEquals(done, true);
		assertEquals(value, undefined);
	}
);

Deno.test
(	'Reader: throwAfterCancel - cancel during pending read',
	async () =>
	{	let resolveRead: ((value: number) => void) | undefined;
		let i = 0;

		function read(view: Uint8Array)
		{	return new Promise<number>(resolve =>
			{	resolveRead = resolve;
				view[0] = i++;
			});
		}

		const cancel = () =>
		{	// Resolve the pending read when cancel is called
			if (resolveRead)
			{	resolveRead(1);
				resolveRead = undefined;
			}
		};

		// Enable throwAfterCancel
		const rs = new RdStream({throwAfterCancel: true, read, cancel});
		using reader = rs.getReader();

		// Start a read that won't complete immediately
		const readPromise = reader.read();

		// Wait a tick to ensure read has started
		await new Promise(y => setTimeout(y, 1));

		// Cancel while read is pending
		await reader.cancel('Canceled during read');

		// The read should complete with done=true
		const {done} = await readPromise;
		assertEquals(done, true);

		// Subsequent reads should throw
		let error: Error|undefined;
		try
		{	await reader.read();
		}
		catch (e)
		{	error = e instanceof Error ? e : new Error(e+'');
		}
		assertEquals(error?.message, 'Stream was canceled');
	}
);

Deno.test
(	'Reader: throwAfterCancel - with tee()',
	async () =>
	{	let i = 1;

		function read(view: Uint8Array)
		{	if (i > 10)
			{	return null;
			}
			view[0] = i++;
			return 1;
		}

		// Enable throwAfterCancel on parent stream
		const rs = new RdStream({throwAfterCancel: true, read});
		{	using reader = rs.getReader();

			// Read some data
			const {value: v1} = await reader.read();
			assertEquals(v1, new Uint8Array([1]));

			// Cancel the parent stream
			await reader.cancel('Stream canceled');

			// Read from parent stream should throw
			let error: Error|undefined;
			try
			{	await reader.read();
			}
			catch (e)
			{	error = e instanceof Error ? e : new Error(e+'');
			}
			assertEquals(error?.message, 'Stream was canceled');
		}

		// Now test with tee() - the tee'd streams should inherit throwAfterCancel
		i = 1; // Reset counter for new test
		const rs2 = new RdStream({throwAfterCancel: true, read});
		const [rs2a, rs2b] = rs2.tee();

		using reader2a = rs2a.getReader();
		using reader2b = rs2b.getReader();

		// Read from first tee'd stream
		const {value: v2a} = await reader2a.read();
		assertEquals(v2a, new Uint8Array([1])); // First byte since we reset i

		// Cancel first tee'd stream - it should throw because throwAfterCancel is inherited
		await reader2a.cancel('First tee canceled');

		// Should throw after cancel
		let error: Error|undefined;
		try
		{	await reader2a.read();
		}
		catch (e)
		{	error = e instanceof Error ? e : new Error(e+'');
		}
		assertEquals(error?.message, 'Stream was canceled');

		// Second tee'd stream should still work independently
		const {value: v2b} = await reader2b.read();
		assertEquals(v2b, new Uint8Array([1])); // Gets the same byte that was read by reader2a (buffered by tee)

		// Can continue reading from second stream
		const {value: v3b} = await reader2b.read();
		assertEquals(v3b, new Uint8Array([2]));

		// Cancel second stream too
		await reader2b.cancel('Second tee canceled');

		// Should also throw after cancel
		error = undefined;
		try
		{	await reader2b.read();
		}
		catch (e)
		{	error = e instanceof Error ? e : new Error(e+'');
		}
		assertEquals(error?.message, 'Stream was canceled');
	}
);

Deno.test
(	'Reader: throwAfterCancel - after stream already closed',
	async () =>
	{	let dataLeft = true;

		function read(view: Uint8Array)
		{	if (!dataLeft)
			{	return null;
			}
			dataLeft = false;
			view[0] = 65;
			return 1;
		}

		const rs = new RdStream({throwAfterCancel: true, read});
		using reader = rs.getReader();

		// Read all data
		await reader.read();

		// Read at EOF (stream closes normally)
		const {done} = await reader.read();
		assertEquals(done, true);

		// Now cancel after it's already closed
		await reader.cancel('Late cancel');

		// Should still throw because cancel was called
		let error: Error|undefined;
		try
		{	await reader.read();
		}
		catch (e)
		{	error = e instanceof Error ? e : new Error(e+'');
		}
		assertEquals(error?.message, 'Stream was canceled');
	}
);
