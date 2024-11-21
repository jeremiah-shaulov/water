/**	This library introduces 3 classes: {@link RdStream}, {@link WrStream} and {@link TrStream}, that can be used in place of
	[ReadableStream]{@link https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream}`<Uint8Array>`,
	[WritableStream]{@link https://developer.mozilla.org/en-US/docs/Web/API/WritableStream}`<Uint8Array>` and
	[TransformStream]{@link https://developer.mozilla.org/en-US/docs/Web/API/TransformStream}`<Uint8Array, Uint8Array>`.

	This library reimplements `ReadableStream`, `WritableStream` and `TransformStream` in the fashion that the author of this library likes.
	The style of this library is to reuse buffers, and not to [transfer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/transfer) buffers.

	This library requires to implement only a simple interface to create stream of bytes.
	Here is such interface that any object can implement to provide to others a readable byte-stream:

	```ts
	interface Source
	{	// Reads up to `p.byteLength` bytes into `p`. It resolves to the number of
		// bytes read (`0` < `n` <= `p.byteLength`) and rejects if any error
		// encountered. Even if `read()` resolves to `n` < `p.byteLength`, it may
		// use all of `p` as scratch space during the call. If some data is
		// available but not `p.byteLength` bytes, `read()` conventionally resolves
		// to what is available instead of waiting for more.
		//
		// When `read()` encounters end-of-file condition, it resolves to EOF
		// (`null`).
		//
		// When `read()` encounters an error, it rejects with an error.
		//
		// Callers should always process the `n` > `0` bytes returned before
		// considering the EOF (`null`). Doing so correctly handles I/O errors that
		// happen after reading some bytes and also both of the allowed EOF
		// behaviors.
		//
		// Implementations should not retain a reference to `p`.
		read(p: Uint8Array): Promise<number|null>;
	}
	```

	Implementing this interface is enough, however this is only a subset of the full {@link Source} interface that is shown below.

	Example of how you can implement it:

	```ts
	const rdStream = new RdStream
	(	{	async read(p)
			{	// ...
				// Load data to `p`
				// ...
				return p.byteLength; // or less
			}
		}
	);

	// now use `rdStream` as you would use an instance of ReadableStream<Uint8Array>
	```

	And the following interface is for writeable streams:

	```ts
	interface Sink
	{	// Writes `p.byteLength` bytes from `p` to the underlying data stream. It
		// resolves to the number of bytes written from `p` (`0` <= `n` <=
		// `p.byteLength`) or reject with the error encountered that caused the
		// write to stop early. `write()` must reject with a non-null error if
		// would resolve to `n` < `p.byteLength`. `write()` must not modify the
		// slice data, even temporarily.
		//
		// Implementations should not retain a reference to `p`.
		write(p: Uint8Array): Promise<number>;
	}
	```

	Example:

	```ts
	const wrStream = new WrStream
	(	{	async write(p)
			{	// ...
				// Write `p` somewhere
				// ...
				return p.byteLength; // or less
			}
		}
	);

	// now use `wrStream` as you would use an instance of WritableStream<Uint8Array>
	```

	## Differences from ReadableStream, WritableStream and TransformStream

	- No controllers concept.
	- BYOB-agnostic. Data consumer can use BYOB or regular reading mode, and there's no need of handling these situations differently.
	- No transferring buffers that you pass to `reader.read(buffer)`, so the buffers remain usable after the call.

	Additional features:

	- {@link RdStream.cancel()} and {@link WrStream.abort()} work also on locked streams.
	- [getReader()]{@link RdStream.getReader} and [getWriter()]{@link WrStream.getWriter} have [getReaderWhenReady()]{@link RdStream.getReaderWhenReady} and [getWriterWhenReady()]{@link WrStream.getWriterWhenReady} counterparts, that wait for reader/writer to be unlocked.
	- {@link RdStream.values()}, {@link RdStream.tee()}, {@link RdStream.pipeTo()} and {@link RdStream.pipeThrough()} are present in both {@link RdStream} and {@link Reader}.
	- Also {@link RdStream} and {@link Reader} have additional methods: [uint8Array()]{@link RdStream.uint8Array}, [text()]{@link RdStream.text} and [unread()]{@link RdStream.unread}.
	- {@link RdStream.pipeTo()} and {@link RdStream.pipeThrough()} are restartable ({@link Transformer.transform()} can close it's writer, and then the rest of the input stream can be piped to elsewhere).
	- {@link Reader} and {@link Writer} implement `Symbol.dispose` that releases the lock.
	- {@link WrStream} has [flush]{@link WrStream.flush} feature.

	## Exported classes and types

	```ts
	import {RdStream, Source} from './mod.ts';
	import {WrStream, Sink} from './mod.ts';
	import {TrStream, Transformer} from './mod.ts';
	import {TooBigError} from './mod.ts';
	```

	- {@link RdStream}
	- {@link WrStream}
	- {@link TrStream}

	### class RdStream

	This class extends [ReadableStream]{@link https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream}`<Uint8Array>`.

	An instance can be created from {@link Source} definition (object that has `read()` method):

	```ts
	const rdStream = new RdStream
	(	{	async read(p)
			{	// ...
				// Load data to `p`
				// ...
				return p.byteLength; // or less
			}
		}
	);
	```

	For example `Deno.stdin` implements `read()`:

	```ts
	const rdStream = new RdStream(Deno.stdin);
	```

	Or it can be created as wrapper on existing `ReadableStream` object. Here is another way of creating {@link RdStream} that reads from stdin:

	```ts
	const rdStream = RdStream.from(Deno.stdin.readable);
	```

	Now `rdStream` and `Deno.stdin.readable` are the same by the means of `ReadableStream` (both have `getReader()`),
	but `RdStream` also has features that `ReadableStream` doesn't have. For example [text()]{@link RdStream.text} function:

	```ts
	console.log(await rdStream.text());
	```

	Creating `RdStream` from `read()` implementors (like `new RdStream(Deno.stdin)`) is preferrable (because it works faster) than creating from another streams (like `RdStream.from(Deno.stdin.readable)`).
	However note that `Deno.stdin` also implements `close()`, so the file descriptor will be closed after reading to the end.
	To prevent this, use:

	```ts
	const rdStream = new RdStream({read: p => Deno.stdin.read(p)});
	```

	{@link RdStream.from()} also allows to create {@link RdStream} instances from iterable objects that yield `Uint8Array` items (see {@link RdStream.from()}).

	#### Example

	The following example demonstrates readable stream that streams the string provided to it's constructor.

	```ts
	import {RdStream} from './mod.ts';

	const textEncoder = new TextEncoder;

	// Readable stream, compatible with `ReadableStream<Uint8Array>`, that streams the string provided to it's constructor.
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

	// Write word "Hello" to stdout
	await new StringStreamer('Hello\n').pipeTo(Deno.stdout.writable);
	```

	#### Constructor:

	{@linkcode RdStream.constructor}

	{@linkcode Source}

	{@link RdStream} instances are constructed from {@link Source} objects, that have definition of how data stream is generated.

	If there's [start()]{@link Source.start} method, it gets called immediately, even before the constructor returns, to let the stream generator to initialize itself.
	If [start()]{@link Source.start} returned Promise, this Promise is awaited before calling [read()]{@link Source.read} for the first time.

	The only mandatory {@link Source} method is [read()]{@link Source.read}. This method is called each time data is requested from the stream by consumer.
	Calls to [read()]{@link Source.read} are sequential, and new call doesn't begin untill previous call is finished (it's promise is fulfilled).
	When [read()]{@link Source.read} is called it must load bytes to provided buffer, and return number of bytes loaded.
	To indicate EOF it can return either `0` or `null`.
	It can return result asynchronously (`Promise` object) or synchronously (number or null result).

	Stream consumer can read the stream in [regular or "BYOB" mode]{@link https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/getReader#mode}.
	In BYOB, the consumer provides it's own buffer, which is passed to {@link Reader.read()}.
	This buffer can be of any non-zero size.
	In regular mode a buffer of at least [autoAllocateMin]{@link Source.autoAllocateMin} bytes is allocated (and passed to {@link Reader.read()}).
	The maximum auto-allocated buffer size is [autoAllocateChunkSize]{@link Source.autoAllocateChunkSize}.

	When [read()]{@link Source.read} returned EOF (`0` or `null`), [close()]{@link Source.close} gets called to finalize the stream generator.

	If [read()]{@link Source.read} thrown exception, [catch()]{@link Source.catch} is called instead of [close()]{@link Source.close}.
	Also if [read()]{@link Source.read} successfully returned EOF, but then [close()]{@link Source.close} thrown exception, [catch()]{@link Source.catch} is also called.

	Stream consumer can decide to cancel the stream by calling {@link RdStream.cancel()} or {@link Reader.cancel()}.
	In this case [cancel()]{@link Source.cancel} callback gets called.
	This is the only callback that can be called in the middle of [read()]{@link Source.read} work, when asynchronous [read()]{@link Source.read} didn't return, so it can tell [read()]{@link Source.read} to return earlier.
	If [cancel()]{@link Source.cancel} thrown exception, [catch()]{@link Source.catch} is called as the last action.

	#### Properties:

	{@linkcode RdStream.locked}

	When somebody wants to start reading this stream, he calls {@link RdStream.getReader()}, and after that call the stream becomes locked.
	Future calls to {@link RdStream.rdStream.getReader()} will throw error till the reader is released ({@link Reader.releaseLock()}).

	Other operations that read the stream (like {@link RdStream.pipeTo()}) also lock it (internally they get reader, and release it later).

	{@linkcode RdStream.isClosed}

	Becomes true when the stream is read to the end, or after {@link RdStream.cancel()} was called.

	#### Methods:

	{@linkcode RdStream.getReader}

	Returns object that allows to read data from the stream.
	The stream becomes locked till this reader is released by calling {@link Reader.releaseLock()} or [Symbol.dispose()]{@link Reader."[Symbol.dispose]"}.

	If the stream is already locked, this method throws error.

	{@linkcode RdStream.getReaderWhenReady}

	Like [getReader()]{@link RdStream.getReader}, but waits for the stream to become unlocked before returning the reader (and so locking it again).

	{@linkcode RdStream.cancel}

	Interrupt current reading operation (reject the promise that {@link Reader.read()} returned, if any),
	and tell to discard further data in the stream.
	This leads to calling {@link Source.cancel(reason)}, even if current {@link Source.read()} didn't finish.
	{@link Source.cancel()} must implement the actual behavior on how to discard further data,
	and finalize the source, as no more callbacks will be called.

	In contrast to `ReadableStream.cancel()`, this method works even if the stream is locked.

	{@linkcode RdStream.unread}

	Push chunk to the stream, so next read will get it.
	This creates internal buffer, and copies the chunk contents to it.

	{@linkcode RdStream."[Symbol.asyncIterator]"}

	{@linkcode RdStream.values}

	Allows to iterate this stream yielding `Uint8Array` data chunks.

	Usually you want to use `for await...of` to iterate.

	```ts
	for await (const chunk of rdStream)
	{	// ...
	}
	```

	It's also possible to iterate manually. In this case you need to be "using" the iterator, or to call [releaseLock()]{@link Reader.releaseLock} explicitly.

	```ts
	using it = rdStream.values();
	while (true)
	{	const {value, done} = await it.next();
		if (done)
		{	break;
		}
		// ...
	}
	```

	If the stream is locked, this method throws error. However you can do [getReaderWhenReady()]{@link RdStream.getReaderWhenReady}, and call identical method on the reader.

	{@linkcode RdStream.tee}

	Splits the stream to 2, so the rest of the data can be read from both of the resulting streams.

	If you'll read from one stream faster than from another, or will not read at all from one of them,
	the default behavior is to buffer the data.

	If `requireParallelRead` option is set, the buffering will be disabled,
	and parent stream will suspend after each item, till it's read by both of the child streams.
	In this case if you read and await from the first stream, without previously starting reading from the second,
	this will cause a deadlock situation.

	If the stream is locked, this method throws error. However you can do [getReaderWhenReady()]{@link RdStream.getReaderWhenReady}, and call identical method on the reader.

	{@linkcode RdStream.pipeTo}

	```ts
	type StreamPipeOptionsLocal =
	{	// Don't close `dest` when this readable stream reaches EOF.
		preventClose?: boolean;

		// Don't abort `dest` when this readable stream enters error state.
		preventAbort?: boolean;

		// Don't cancel this readable stream, if couldn't write to `dest`.
		preventCancel?: boolean;

		// Allows to interrupt piping operation.
		// The same effect can be reached by aborting the `dest` writable stream.
		signal?: AbortSignal;
	};
	```

	Pipe data from this stream to `dest` writable stream (that can be built-in `WritableStream<Uint8Array>` or {@link WrStream}).

	If the data is piped to EOF without error, the source readable stream is closed as usual ([close()]{@link Source.close} callback is called on {@link Source}),
	and the writable stream will be closed unless `preventClose` option is set.

	If destination closes or enters error state, then {@link RdStream.pipeTo()} throws exception.
	But then {@link RdStream.pipeTo()} can be called again to continue piping the rest of the input stream to another destination (including the chunk that previous {@link RdStream.pipeTo()} failed to write).

	If the stream is locked, this method throws error. However you can do [getReaderWhenReady()]{@link RdStream.getReaderWhenReady}, and call identical method on the reader.

	{@linkcode RdStream.pipeThrough}

	Uses {@link RdStream.pipeTo()} to pipe the data to transformer's writable stream, and returns transformer's readable stream.

	The transformer can be an instance of built-in `TransformStream<Uint8Array, unknown>`, {@link TrStream}, or any other object that implements the `Transform` interface (has `writable/readable` pair).

	If the stream is locked, this method throws error. However you can do [getReaderWhenReady()]{@link RdStream.getReaderWhenReady}, and call identical method on the reader.

	{@linkcode RdStream.uint8Array}

	Reads the whole stream to memory.

	If `lengthLimit` is specified (and is positive number), and the stream happens to be bigger than this number, a {@link TooBigError} exception is thrown.

	If the stream is locked, this method throws error. However you can do [getReaderWhenReady()]{@link RdStream.getReaderWhenReady}, and call identical method on the reader.

	{@linkcode RdStream.text}

	Reads the whole stream to memory, and converts it to string, just as `TextDecoder.decode()` does.

	If `lengthLimit` is specified (and is positive number), and the stream happens to be bigger than this number, a {@link TooBigError} exception is thrown.

	If the stream is locked, this method throws error. However you can do [getReaderWhenReady()]{@link RdStream.getReaderWhenReady}, and call identical method on the reader.

	#### Static methods:

	{@linkcode RdStream.from}

	Constructs {@link RdStream} from an iterable of `Uint8Array`.
	Note that `ReadableStream<Uint8Array>` is also iterable of `Uint8Array`, so it can be converted to {@link RdStream},
	and the resulting {@link RdStream} will be a wrapper on it.

	If you have data source that implements both `ReadableStream<Uint8Array>` and `Deno.Reader`, it's more efficient to create wrapper from `Deno.Reader`
	by calling the {@link RdStream} constructor.

	```ts
	// Create from `Deno.Reader`. This is preferred.
	const file1 = await Deno.open('/etc/passwd');
	const rdStream1 = new RdStream(file1); // `file1` is `Deno.Reader`
	console.log(await rdStream1.text());

	// Create from `ReadableStream<Uint8Array>`.
	const file2 = await Deno.open('/etc/passwd');
	const rdStream2 = RdStream.from(file2.readable); // `file2.readable` is `ReadableStream<Uint8Array>`
	console.log(await rdStream2.text());
	```

	### class WrStream

	This class extends [WritableStream]{@link https://developer.mozilla.org/en-US/docs/Web/API/WritableStream}`<Uint8Array>`.

	#### Example

	```ts
	import {WrStream} from './mod.ts';

	const EMPTY_CHUNK = new Uint8Array;

	// Writable stream that accumulates data to string result.
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

		toString()
		{	return this.value;
		}
	}

	// Create sink
	const sink = new StringSink;

	// Start downloading some HTML page
	const resp = await fetch('https://example.com/');

	// Pipe the HTML stream to the sink
	await resp.body?.pipeTo(sink);

	// Print the result
	console.log(sink+'');
	```

	#### Constructor:

	{@linkcode WrStream.constructor}

	{@linkcode Sink}

	In the Sink [write()]{@link Sink.write} is a mandatory method.
	It can return result asynchronously (`Promise` object) or synchronously (number result).

	#### Properties:

	{@linkcode WrStream.locked}

	When somebody wants to start writing to this stream, he calls {@link WrStream.getWriter()}, and after that call the stream becomes locked.
	Future calls to {@link WrStream.getWriter()} will throw error till the writer is released ({@link Writer.releaseLock()}).

	Other operations that write to the stream (like {@link WrStream.write()}) also lock it (internally they get writer, and release it later).

	{@linkcode WrStream.isClosed}

	Becomes true after [close()]{@link WrStream.close} or [abort()]{@link WrStream.abort} was called.

	#### Methods:

	{@linkcode WrStream.getWriter}

	Returns object that allows to write data to the stream.
	The stream becomes locked till this writer is released by calling {@link Writer.releaseLock()} or [Symbol.dispose()]{@link Writer."[Symbol.dispose]"}.

	If the stream is already locked, this method throws error.

	{@linkcode WrStream.getWriterWhenReady}

	Like {@link WrStream.getWriter()}, but waits for the stream to become unlocked before returning the writer (and so locking it again).

	{@linkcode WrStream.abort}

	Interrupt current writing operation (reject the promise that {@link Writer.write()} returned, if any),
	and set the stream to error state.
	This leads to calling {@link Sink.abort(reason)}, even if current {@link Sink.write()} didn't finish.
	{@link Sink.abort()} is expected to interrupt or complete all the current operations,
	and finalize the sink, as no more callbacks will be called.

	In contrast to `WritableStream.abort()`, this method works even if the stream is locked.

	{@linkcode WrStream.close}

	Calls {@link Sink.close()}. After that no more callbacks will be called.
	If {@link Sink.close()} called again on already closed stream, nothing happens (no error is thrown).

	{@linkcode WrStream.write}

	Waits for the stream to be unlocked, gets writer (locks the stream),
	writes the chunk, and then releases the writer (unlocks the stream).
	This is the same as doing:

	```ts
	{	using writer = await wrStream.getWriterWhenReady();
		await writer.write(chunk);
	}
	```

	{@linkcode WrStream.flush}

	Waits for the stream to be unlocked, gets writer (locks the stream),
	flushes the stream, and then releases the writer (unlocks the stream).
	This is the same as doing:

	```ts
	{	using writer = await wrStream.getWriterWhenReady();
		await writer.flush();
	}
	```

	### class TrStream

	This class extends [TransformStream]{@link https://developer.mozilla.org/en-US/docs/Web/API/TransformStream}`<Uint8Array, Uint8Array>`.

	#### Examples

	The following example demonstrates {@link TrStream} that encloses the input in `"`-quotes, and inserts `\` chars before each `"` or `\` in the input,
	and converts ASCII CR and LF to `\r` and `\n` respectively.

	```ts
	import {RdStream, TrStream} from './mod.ts';

	// StringStreamer:

	const textEncoder = new TextEncoder;

	// Readable stream, compatible with `ReadableStream<Uint8Array>`, that streams the string provided to it's constructor.
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

	// Escaper:

	const C_SLASH = '\\'.charCodeAt(0);
	const C_QUOT = '"'.charCodeAt(0);
	const C_CR = '\r'.charCodeAt(0);
	const C_LF = '\n'.charCodeAt(0);
	const C_R = 'r'.charCodeAt(0);
	const C_N = 'n'.charCodeAt(0);

	const QUOT_ARR = new Uint8Array([C_QUOT]);

	// Transforms stream by enclosing it in `"`-quotes, and inserting `\` chars before each `"` or `\` in the input,
	// and converts ASCII CR and LF to `\r` and `\n` respectively.
	class Escaper extends TrStream
	{	constructor()
		{	super
			(	{	async start(writer)
					{	await writer.write(QUOT_ARR);
					},

					async transform(writer, chunk)
					{	const len = chunk.byteLength;
						let pos = 0;
						let cAfterSlash = 0;
						for (let i=0; i<len; i++)
						{	switch (chunk[i])
							{	case C_SLASH:
									cAfterSlash = C_SLASH;
									break;
								case C_QUOT:
									cAfterSlash = C_QUOT;
									break;
								case C_CR:
									cAfterSlash = C_R;
									break;
								case C_LF:
									cAfterSlash = C_N;
									break;
								default:
									continue;
							}
							const iPlusOne = i + 1;
							if (iPlusOne < len)
							{	const tmp = chunk[iPlusOne];
								chunk[i] = C_SLASH;
								chunk[iPlusOne] = cAfterSlash;
								await writer.write(chunk.subarray(pos, iPlusOne+1));
								chunk[iPlusOne] = tmp;
								pos = iPlusOne;
							}
							else
							{	chunk[i] = C_SLASH;
								await writer.write(chunk.subarray(pos)); // write the string with `\` in place of the last char
								chunk[i] = cAfterSlash;
								await writer.write(chunk.subarray(i)); // write `cAfterSlash` after the slash
								return len;
							}
						}
						await writer.write(chunk.subarray(pos));
						return len;
					},

					async flush(writer)
					{	await writer.write(QUOT_ARR);
					},
				}
			);
		}
	}

	// Write escaped string to stdout
	await new StringStreamer('Unquoted "quoted"\n').pipeThrough(new Escaper).pipeTo(Deno.stdout.writable);
	```

	The following example demonstrates how `TrStream` can pass (or transform) only a part of its input stream, and then stop.
	The output stream that `pipeThrough()` produces will terminate, but then it's possible to pipe the rest of the input stream
	with second `pipeThrough()` or `pipeTo()`, or just to read it with `text()`.

	```ts
	import {RdStream, WrStream, TrStream} from './mod.ts';

	// StringStreamer:

	const textEncoder = new TextEncoder;

	// Readable stream, compatible with `ReadableStream<Uint8Array>`, that streams the string provided to it's constructor.
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

	// CopyOneToken:

	const C_SPACE = ' '.charCodeAt(0);

	// Passes through the input stream till first SPACE character, and closes the output.
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

	// Wrap stdout
	const stdout = new WrStream(Deno.stdout);
	// Create tokens stream
	const tokens = new StringStreamer('One Two Three Four');
	// Print the first token ("One")
	console.log('Print first token:');
	await tokens.pipeThrough(new CopyOneToken).pipeTo(stdout, {preventClose: true});
	// Print the second token ("Two")
	console.log('\nPrint second token:');
	await tokens.pipeThrough(new CopyOneToken).pipeTo(stdout, {preventClose: true});
	// Print the rest of the tokens stream ("Three Four")
	console.log('\nRest: '+await tokens.text());
	```

	#### Constructor:

	{@linkcode TrStream.constructor}

	{@linkcode Transformer}

	#### Properties:

	{@linkcode TrStream.writable}

	Input for the original stream.
	All the bytes written here will be transformed by this object, and will be available for reading from {@link TrStream.readable}.

	{@linkcode TrStream.readable}

	Outputs the transformed stream.

	@module
	@summary water - Alternative to ReadableStream, WritableStream and TransformStream.
 **/

export {RdStream, type Source, TooBigError, Reader} from './private/rd_stream.ts';
export {WrStream, type Sink, ClosedError, Writer} from './private/wr_stream.ts';
export {TrStream, type Transformer} from './private/tr_stream.ts';
