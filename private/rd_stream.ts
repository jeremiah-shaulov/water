import {DEFAULT_AUTO_ALLOCATE_SIZE, Callbacks, CallbackAccessor, ReaderOrWriter} from './common.ts';
import {Writer, _useLowLevelCallbacks} from './wr_stream.ts';
import {Piper} from './piper.ts';
import {TeeRegular, TeeRequireParallelRead} from './tee.ts';

// deno-lint-ignore no-explicit-any
type Any = any;

const _setWaitBeforeClose = Symbol('_setWaitBeforeClose');

export class TooBigError extends Error
{
}

export type Source =
{	// properties:

	/**	When auto-allocating (reading in non-byob mode) will pass to {@link Source.read} buffers of at most this size.
		If undefined or non-positive number, a predefined default value (like 32 KiB) is used.
	 **/
	autoAllocateChunkSize?: number;

	/**	When auto-allocating (reading in non-byob mode) will not call `read()` with buffers smaller than this.
		First i'll allocate `autoAllocateChunkSize` bytes, and if `read()` callback fills in only a small part of them
		(so there're >= `autoAllocateMin` unused bytes in the buffer), i'll reuse that part of the buffer in next `read()` calls.
	 **/
	autoAllocateMin?: number;

	/**	This callback is called immediately during `RdStream` object creation.
		When it's promise resolves, i start to call `read()` to pull data as response to `reader.read()`.
		Only one call is active at each moment, and next calls wait for previous calls to complete.

		At the end one of `close()`, `cancel(reason)` or `catch(error)` is called.
		- `close()` is called if `read()` returned EOF (`0` or `null`).
		- `cancel()` if caller called `rdStream.cancel(reason)` or `reader.cancel(reason)`.
		- `catch()` if `read()` thrown exception or returned a rejected promise.

		And the very last step is to call `finally()`, and if it thrown also to call `catch()` (again?).
	 **/
	start?(): void | PromiseLike<void>;

	/**	This method is called to pull data from input source to a Uint8Array object provied to it.
		The object provided is never empty.
		The function is expected to load available data to the view, and to return number of bytes loaded.
		On EOF it's expected to return `0` or `null`.
		This callback is called as response to user request for data, and it's never called before such request.
	 **/
	read(view: Uint8Array): number | null | PromiseLike<number|null>;

	/**	This method is called when {@link Source.read} returns `0` or `null` that indicate EOF.
		After that, no more callbacks are called (except `catch()`).
		If you use `Deno.Reader & Deno.Closer` as source, that source will be closed when read to the end without error.
	 **/
	close?(): void | PromiseLike<void>;

	/**	Is called as response to `rdStream.cancel()` or `reader.cancel()`.
		After that, no more callbacks are called (except `catch()`).
	 **/
	cancel?(reason: Any): void | PromiseLike<void>;

	/**	Is called when `start()`, `read()`, `close()` or `cancel()` thrown exception or returned a rejected promise.
		After that, no more callbacks are called.
		Exceptions in `catch()` are silently ignored.
	 **/
	catch?(reason: Any): void | PromiseLike<void>;

	/**	Is called when the stream is finished in either way.
	 **/
	finally?(): void | PromiseLike<void>;
};

/**	This class extends `ReadableStream<Uint8Array>`, and can be used as it's substitutor.
	It has the following differences:

	- Source is defined with `Deno.Reader`-compatible object.
	- No controllers concept.
	- BYOB-agnostic. Data consumer can use BYOB or regular reading mode, and there's no need of handling these situations differently.
	- No transferring buffers that you pass to `reader.read(buffer)`, so the buffers remain usable after the call.
 **/
export class RdStream extends ReadableStream<Uint8Array>
{	// static:

	/**	Constructs `RdStream` from an iterable of `Uint8Array`.
		Note that `ReadableStream<Uint8Array>` is also iterable of `Uint8Array`, so it can be converted to `RdStream`,
		and the resulting `RdStream` will be a wrapper on it.

		If you have data source that implements both `ReadableStream<Uint8Array>` and `Deno.Reader`, it's more efficient to create wrapper from `Deno.Reader`
		by calling the `RdStream` constructor.

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
	 **/
	static from<R>(source: AsyncIterable<R> | Iterable<R | PromiseLike<R>>): ReadableStream<R> & RdStream
	{	if (source instanceof RdStream)
		{	return source as Any;
		}
		else if (source instanceof ReadableStream)
		{	let readerInUse: ReadableStreamBYOBReader | ReadableStreamDefaultReader<unknown> | undefined;
			let innerRead: ((view: Uint8Array) => Promise<number>) | undefined;
			return new RdStream
			(	{	read(view)
					{	if (!innerRead)
						{	try
							{	// Try BYOB
								const reader = source.getReader({mode: 'byob'});
								readerInUse = reader;
								let buffer = new Uint8Array(DEFAULT_AUTO_ALLOCATE_SIZE);
								innerRead = async view =>
								{	try
									{	const {value, done} = await reader.read(buffer.subarray(0, Math.min(view.byteLength, buffer.byteLength)));
										if (done)
										{	reader.releaseLock();
										}
										if (value)
										{	view.set(value);
											buffer = new Uint8Array(value.buffer);
											return value.byteLength;
										}
										return 0;
									}
									catch (e)
									{	reader.releaseLock();
										throw e;
									}
								};
							}
							catch
							{	// BYOB failed, so use default
								const reader = source.getReader();
								readerInUse = reader;
								let buffer: Uint8Array|undefined;
								innerRead = async view =>
								{	try
									{	if (!buffer)
										{	const {value, done} = await reader.read();
											if (done)
											{	reader.releaseLock();
												return 0;
											}
											if (!(value instanceof Uint8Array))
											{	throw new Error('Must be async iterator of Uint8Array');
											}
											buffer = value;
										}
										const haveLen = buffer.byteLength;
										const askedLen = view.byteLength;
										if (haveLen <= askedLen)
										{	view.set(buffer);
											buffer = undefined;
											return haveLen;
										}
										else
										{	view.set(buffer.subarray(0, askedLen));
											buffer = buffer.subarray(askedLen);
											return askedLen;
										}
									}
									catch (e)
									{	reader.releaseLock();
										throw e;
									}
								};
							}
						}
						return innerRead(view);
					},
					cancel(reason)
					{	return (readerInUse ?? source).cancel(reason);
					}
				}
			) as Any;
		}
		else if (Symbol.asyncIterator in source)
		{	const it = source[Symbol.asyncIterator]();
			let buffer: Uint8Array|undefined;
			return new RdStream
			(	{	async read(view)
					{	if (!buffer)
						{	const {value, done} = await it.next();
							if (done)
							{	return null;
							}
							if (!(value instanceof Uint8Array))
							{	throw new Error('Must be async iterator of Uint8Array');
							}
							buffer = value;
						}
						const haveLen = buffer.byteLength;
						const askedLen = view.byteLength;
						if (haveLen <= askedLen)
						{	view.set(buffer);
							buffer = undefined;
							return haveLen;
						}
						else
						{	view.set(buffer.subarray(0, askedLen));
							buffer = buffer.subarray(askedLen);
							return askedLen;
						}
					},
					async cancel()
					{	await it.return?.();
					}
				}
			) as Any;
		}
		else if (Symbol.iterator in source)
		{	const it = source[Symbol.iterator]();
			let buffer: Uint8Array|undefined;
			return new RdStream
			(	{	async read(view)
					{	if (!buffer)
						{	const {value, done} = it.next();
							if (done)
							{	return null;
							}
							const valueValue = await value;
							if (!(valueValue instanceof Uint8Array))
							{	throw new Error('Must be iterator of Uint8Array or Promise<Uint8Array>');
							}
							buffer = valueValue;
						}
						const haveLen = buffer.byteLength;
						const askedLen = view.byteLength;
						if (haveLen <= askedLen)
						{	view.set(buffer);
							buffer = undefined;
							return haveLen;
						}
						else
						{	view.set(buffer.subarray(0, askedLen));
							buffer = buffer.subarray(askedLen);
							return askedLen;
						}
					},
					cancel()
					{	it.return?.();
					}
				}
			) as Any;
		}
		else
		{	throw new Error('Invalid argument');
		}
	}

	// properties:

	#callbackAccessor: ReadCallbackAccessor;
	#locked = false;
	#readerRequests = new Array<(reader: (ReadableStreamDefaultReader<Uint8Array> | ReadableStreamBYOBReader) & Reader) => void>;

	/**	When somebody wants to start reading this stream, he calls `rdStream.getReader()`, and after that call the stream becomes locked.
		Future calls to `rdStream.getReader()` will throw error till the reader is released (`reader.releaseLock()`).

		Other operations that read the stream (like `rdStream.pipeTo()`) also lock it (internally they get reader, and release it later).
	 **/
	get locked()
	{	return this.#locked;
	}

	// constructor:

	constructor(source: Source)
	{	super();
		const autoAllocateChunkSizeU = source.autoAllocateChunkSize;
		const autoAllocateMinU = source.autoAllocateMin;
		const autoAllocateChunkSize = autoAllocateChunkSizeU && autoAllocateChunkSizeU>0 ? autoAllocateChunkSizeU : DEFAULT_AUTO_ALLOCATE_SIZE;
		const autoAllocateMin = Math.min(autoAllocateChunkSize, autoAllocateMinU && autoAllocateMinU>0 ? autoAllocateMinU : Math.max(256, autoAllocateChunkSize >> 3));
		this.#callbackAccessor = new ReadCallbackAccessor(autoAllocateChunkSize, autoAllocateMin, source);
	}

	// methods:

	/**	Set promise that will be awaited before closing the stream. It must not throw (reject).
	 **/
	[_setWaitBeforeClose](waitBeforeClose: Promise<unknown>)
	{	this.#callbackAccessor.waitBeforeClose = waitBeforeClose;
	}

	/**	Returns object that allows to read data from the stream.
		The stream becomes locked till this reader is released by calling `reader.releaseLock()` or `reader[Symbol.dispose]()`.

		If the stream is already locked, this method throws error.
	 **/
	getReader(options?: {mode?: undefined}): ReadableStreamDefaultReader<Uint8Array> & Reader;
	getReader(options: {mode: 'byob'}): ReadableStreamBYOBReader & Reader;
	getReader(_options?: {mode?: 'byob'}): (ReadableStreamDefaultReader<Uint8Array> | ReadableStreamBYOBReader) & Reader
	{	if (this.#locked)
		{	throw new TypeError('ReadableStream is locked.');
		}
		this.#locked = true;
		return new Reader
		(	this.#callbackAccessor,
			() =>
			{	this.#locked = false;
				const y = this.#readerRequests.shift();
				if (y)
				{	y(this.getReader());
				}
			}
		);
	}

	/**	Like `rdStream.getReader()`, but waits for the stream to become unlocked before returning the reader (and so locking it again).
	 **/
	getReaderWhenReady(options?: {mode?: undefined}): Promise<ReadableStreamDefaultReader<Uint8Array> & Reader>;
	getReaderWhenReady(options: {mode: 'byob'}): Promise<ReadableStreamBYOBReader & Reader>;
	getReaderWhenReady(_options?: {mode?: 'byob'}): Promise<(ReadableStreamDefaultReader<Uint8Array> | ReadableStreamBYOBReader) & Reader>
	{	if (!this.#locked)
		{	return Promise.resolve(this.getReader());
		}
		return new Promise<(ReadableStreamDefaultReader<Uint8Array> | ReadableStreamBYOBReader) & Reader>(y => {this.#readerRequests.push(y)});
	}

	/**	Interrupt current reading operation (reject the promise that `reader.read()` returned, if any),
		and tell to discard further data in the stream.
		This leads to calling `source.cancel(reason)`, even if current `source.read()` didn't finish.
		`source.cancel()` must implement the actual behavior on how to discard further data,
		and finalize the source, as no more callbacks will be called.

		In contrast to `ReadableStream.cancel()`, this method works even if the stream is locked.
	 **/
	cancel(reason?: Any)
	{	return this.#callbackAccessor.close(true, reason);
	}

	/**	Push chunk to the stream, so next read will get it.
		This creates internal buffer, and copies the chunk contents to it.
	 **/
	unread(chunk: Uint8Array)
	{	const reader = this.getReader();
		try
		{	reader.unread(chunk);
		}
		finally
		{	reader.releaseLock();
		}
	}

	/**	Allows to iterate this stream yielding `Uint8Array` data chunks.

		Usually you want to use `for await...of` to iterate.
		```ts
		for await (const chunk of rdStream)
		{	// ...
		}
		```
		It's also possible to iterate manually. In this case you need to be "using" the iterator, or to call `releaseLock()` explicitly.
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

		If the stream is locked, this method throws error. However you can do `getReaderWhenReady()`, and call identical method on the reader.
	 **/
	[Symbol.asyncIterator](options?: {preventCancel?: boolean})
	{	return new ReadableStreamIterator(this.getReader(), options?.preventCancel===true);
	}

	/**	This function is the same as `this[Symbol.asyncIterator]`.
		It allows to iterate this stream yielding `Uint8Array` data chunks.

		Usually you want to use `for await...of` to iterate.
		```ts
		for await (const chunk of rdStream.values())
		{	// ...
		}
		```
		It's also possible to iterate manually. In this case you need to be "using" the iterator, or to call `releaseLock()` explicitly.
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

		If the stream is locked, this method throws error. However you can do `getReaderWhenReady()`, and call identical method on the reader.
	 **/
	values(options?: {preventCancel?: boolean})
	{	return new ReadableStreamIterator(this.getReader(), options?.preventCancel===true);
	}

	/**	Splits the stream to 2, so the rest of the data can be read from both of the resulting streams.

		If you'll read from one stream faster than from another, or will not read at all from one of them,
		the default behavior is to buffer the data.

		If `requireParallelRead` option is set, the buffering will be disabled,
		and parent stream will suspend after each item, till it's read by both of the child streams.
		In this case if you read and await from the first stream, without previously starting reading from the second,
		this will cause a deadlock situation.

		If the stream is locked, this method throws error. However you can do `getReaderWhenReady()`, and call identical method on the reader.
	 **/
	tee(options?: {requireParallelRead?: boolean}): [RdStream, RdStream]
	{	return this.getReader().tee(options);
	}

	/**	Pipe data from this stream to `dest` writable stream (that can be built-in `WritableStream<Uint8Array>` or `WrStream`).

		If the data is piped to EOF without error, the source readable stream is closed as usual (`close()` callback is called on `Source`),
		and the writable stream will be closed unless `preventClose` option is set.

		If destination closes or enters error state, then `pipeTo()` throws exception.
		But then `pipeTo()` can be called again to continue piping the rest of the stream to another destination (including previously buffered data).

		If the stream is locked, this method throws error. However you can do `getReaderWhenReady()`, and call identical method on the reader.
	 **/
	async pipeTo(dest: WritableStream<Uint8Array>, options?: PipeOptions)
	{	const reader = this.getReader();
		try
		{	return await reader.pipeTo(dest, options);
		}
		finally
		{	reader.releaseLock();
		}
	}

	/**	Uses `rdStream.pipeTo()` to pipe the data to transformer's writable stream, and returns transformer's readable stream.

		The transformer can be an instance of built-in `TransformStream<Uint8Array, unknown>`, `TrStream`, or any other `writable/readable` pair.

		If the stream is locked, this method throws error. However you can do `getReaderWhenReady()`, and call identical method on the reader.
	 **/
	pipeThrough<T, W extends WritableStream<Uint8Array>, R extends ReadableStream<T>>
	(	transform:
		{	readonly writable: W;
			readonly readable: R;
		},
		options?: PipeOptions
	)
	{	const waitBeforeClose = this.pipeTo(transform.writable, options).then(undefined, () => {});
		const {readable} = transform;
		if (readable instanceof RdStream)
		{	readable[_setWaitBeforeClose](waitBeforeClose);
		}
		return readable;
	}

	/**	Reads the whole stream to memory.
		If `lengthLimit` is specified (and is positive number), and the stream happens to be bigger than this number,
		a `TooBigError` exception is thrown.

		If the stream is locked, this method throws error. However you can do `getReaderWhenReady()`, and call identical method on the reader.
	 **/
	async uint8Array(options?: {lengthLimit?: number})
	{	const reader = this.getReader();
		try
		{	return await reader.uint8Array(options);
		}
		finally
		{	reader.releaseLock();
		}
	}

	/**	Reads the whole stream to memory, and converts it to string, just as `TextDecoder.decode()` does.
		If `lengthLimit` is specified (and is positive number), and the stream happens to be bigger than this number,
		a `TooBigError` exception is thrown.

		If the stream is locked, this method throws error. However you can do `getReaderWhenReady()`, and call identical method on the reader.
	 **/
	async text(label?: string, options?: TextDecoderOptions & {lengthLimit?: number})
	{	return new TextDecoder(label, options).decode(await this.uint8Array(options));
	}
}

class ReadCallbackAccessor extends CallbackAccessor
{	curPiper: Piper|undefined;

	#autoAllocateBuffer: Uint8Array|undefined;

	constructor
	(	public autoAllocateChunkSize: number,
		public autoAllocateMin: number,
		callbacks: Callbacks,
	)
	{	super(callbacks, false);
	}

	read(view?: Uint8Array)
	{	if (view?.byteLength === 0)
		{	throw new Error('Empty BYOB buffer passed to read()');
		}
		return this.useCallbacks
		(	async callbacks =>
			{	let isUserSuppliedBuffer = true;
				const {curPiper} = this;
				if (curPiper)
				{	const data = curPiper.read(view);
					if (data)
					{	return data;
					}
					this.#autoAllocateBuffer = curPiper.buffer; // good to have some buffer
					this.curPiper = undefined;
				}
				if (!view)
				{	view = this.#autoAllocateBuffer ?? new Uint8Array(this.autoAllocateChunkSize);
					this.#autoAllocateBuffer = undefined;
					isUserSuppliedBuffer = false;
				}
				const nRead = await callbacks.read!(view);
				if (!isUserSuppliedBuffer)
				{	const end = view.byteOffset + (nRead ?? 0);
					if (view.buffer.byteLength-end >= this.autoAllocateMin)
					{	this.#autoAllocateBuffer = new Uint8Array(view.buffer, end);
					}
				}
				if (!nRead)
				{	await this.close();
				}
				else
				{	return view.subarray(0, nRead);
				}
			}
		);
	}

	getOrCreatePiper()
	{	let {curPiper} = this;
		if (!curPiper)
		{	const autoAllocateBuffer = this.#autoAllocateBuffer;
			if (autoAllocateBuffer && autoAllocateBuffer.byteLength>=this.autoAllocateChunkSize)
			{	curPiper = new Piper(autoAllocateBuffer, this.autoAllocateMin);
				this.#autoAllocateBuffer = undefined;
			}
			else
			{	curPiper = new Piper(new Uint8Array(this.autoAllocateChunkSize), this.autoAllocateMin);
			}
			this.curPiper = curPiper;
		}
		return curPiper;
	}
}

/**	This class plays the same role in `RdStream` as does `ReadableStreamBYOBReader` in `ReadableStream<Uint8Array>`.
 **/
export class Reader extends ReaderOrWriter<ReadCallbackAccessor>
{	read(): Promise<ReadableStreamDefaultReadResult<Uint8Array>>;
	read<V extends ArrayBufferView>(view: V): Promise<ReadableStreamBYOBReadResult<V>>;
	async read<V extends ArrayBufferView>(view?: V): Promise<ReadableStreamBYOBReadResult<V>>
	{	if (view && !(view instanceof Uint8Array))
		{	throw new Error('Only Uint8Array is supported'); // i always return `Uint8Array`, and it must be also `V`
		}
		const view2 = await this.getCallbackAccessor().read(view);
		return {
			value: !view2 ? view?.subarray(0, 0) : view2 as Any,
			done: !view2,
		};
	}

	cancel(reason?: Any)
	{	return this.getCallbackAccessor().close(true, reason);
	}

	/**	Push chunk to the stream, so next read will get it.
		This creates internal buffer, and copies the chunk contents to it.
	 **/
	unread(chunk: Uint8Array)
	{	this.getCallbackAccessor().getOrCreatePiper().unread(chunk);
	}

	/**	Allows you to iterate this stream yielding `Uint8Array` data chunks.
	 **/
	[Symbol.asyncIterator](options?: {preventCancel?: boolean})
	{	return new ReadableStreamIterator(this, options?.preventCancel===true);
	}

	/**	Allows you to iterate this stream yielding `Uint8Array` data chunks.
	 **/
	values(options?: {preventCancel?: boolean})
	{	return new ReadableStreamIterator(this, options?.preventCancel===true);
	}

	/**	Splits the stream to 2, so the rest of the data can be read from both of the resulting streams.

		If you'll read from one stream faster than from another, or will not read at all from one of them,
		the default behavior is to buffer the data.

		If `requireParallelRead` option is set, the buffering will be disabled,
		and parent stream will suspend after each item, till it's read by both of the child streams.
		In this case if you read and await from the first stream, without previously starting reading from the second,
		this will cause a deadlock situation.
	 **/
	tee(options?: {requireParallelRead?: boolean}): [RdStream, RdStream]
	{	const tee = options?.requireParallelRead ? new TeeRequireParallelRead(this) : new TeeRegular(this);

		return [
			new RdStream
			(	{	read: view => tee.read(view, -1),
					cancel: reason => tee.cancel(reason, -1),
				}
			),
			new RdStream
			(	{	read: view => tee.read(view, +1),
					cancel: reason => tee.cancel(reason, +1),
				}
			),
		];
	}

	/**	Pipe data from this stream to `dest` writable stream (that can be built-in `WritableStream<Uint8Array>` or `WrStream`).

		If the data is piped to EOF without error, the source readable stream is closed as usual (`close()` callback is called on `Source`),
		and the writable stream will be closed unless `preventClose` option is set.

		If destination closes or enters error state, then `pipeTo()` throws exception.
		But then `pipeTo()` can be called again to continue piping the rest of the stream to another destination (including previously buffered data).
	 **/
	async pipeTo(dest: WritableStream<Uint8Array>, options?: PipeOptions)
	{	const callbackAccessor = this.getCallbackAccessor();
		const writer = dest.getWriter();
		try
		{	const signal = options?.signal;
			if (signal)
			{	if (signal.aborted)
				{	throw signal.reason;
				}
				signal.addEventListener('abort', () => {writer.abort(signal.reason)});
			}
			const curPiper = callbackAccessor.getOrCreatePiper();
			const isEof = await callbackAccessor.useCallbacks
			(	callbacksForRead =>
				{	if (writer instanceof Writer)
					{	return writer[_useLowLevelCallbacks]
						(	callbacksForWrite => curPiper.pipeTo
							(	writer.closed,
								callbacksForRead,
								(chunk, canReturnZero) =>
								{	const resultOrPromise = callbacksForWrite.write!(chunk, canReturnZero);
									if (typeof(resultOrPromise) != 'object')
									{	return -resultOrPromise - 1;
									}
									return resultOrPromise.then(result => -result - 1);
								}
							)
						);
					}
					else
					{	return curPiper.pipeTo
						(	writer.closed,
							callbacksForRead,
							async chunk =>
							{	await writer.write(chunk);
								return -chunk.byteLength - 1;
							}
						);
					}
				}
			);
			if (isEof !== false)
			{	callbackAccessor.curPiper = undefined;
				if (options?.preventClose)
				{	await callbackAccessor.close();
				}
				else
				{	await Promise.all([callbackAccessor.close(), writer.close()]);
				}
			}
		}
		catch (e)
		{	if (callbackAccessor.error !== undefined)
			{	// Read error
				if (!options?.preventAbort)
				{	await writer.abort(e);
				}
			}
			else
			{	// Write error
				if (!options?.preventCancel)
				{	await this.cancel(e);
				}
			}
		}
		finally
		{	writer.releaseLock();
		}
	}

	/**	Uses `reader.pipeTo()` to pipe the data to transformer's writable stream, and returns transformer's readable stream.

		The transformer can be an instance of built-in `TransformStream<Uint8Array, unknown>`, `TrStream`, or any other `writable/readable` pair.
	 **/
	pipeThrough<T, W extends WritableStream<Uint8Array>, R extends ReadableStream<T>>
	(	transform:
		{	readonly writable: W;
			readonly readable: R;
		},
		options?: PipeOptions
	)
	{	const waitBeforeClose = this.pipeTo(transform.writable, options).then(undefined, () => {});
		const {readable} = transform;
		if (readable instanceof RdStream)
		{	readable[_setWaitBeforeClose](waitBeforeClose);
		}
		return readable;
	}

	/**	Reads the whole stream to memory.
		If `lengthLimit` is specified (and is positive number), and the stream happens to be bigger than this number,
		a `TooBigError` exception is thrown.
	 **/
	async uint8Array(options?: {lengthLimit?: number})
	{	const lengthLimit = options?.lengthLimit || Number.MAX_SAFE_INTEGER;
		const callbackAccessor = this.getCallbackAccessor();
		const result = await callbackAccessor.useCallbacks
		(	async callbacks =>
			{	const chunks = new Array<Uint8Array>;
				let totalLen = 0;
				const {curPiper} = callbackAccessor;
				if (curPiper)
				{	const chunk = curPiper.read();
					if (chunk)
					{	chunks[0] = chunk;
						totalLen = chunk.byteLength;
						if (totalLen > lengthLimit)
						{	throw new TooBigError('Data is too big');
						}
					}
					callbackAccessor.curPiper = undefined;
				}
				let chunkSize = callbackAccessor.autoAllocateChunkSize || DEFAULT_AUTO_ALLOCATE_SIZE;
				const autoAllocateMin = callbackAccessor.autoAllocateMin;
				while (true)
				{	let chunk = new Uint8Array(chunkSize);
					while (chunk.byteLength >= autoAllocateMin)
					{	const nRead = await callbacks.read!(chunk);
						if (!nRead)
						{	await callbackAccessor.close();
							const {byteOffset} = chunk;
							if (byteOffset > 0)
							{	chunk = new Uint8Array(chunk.buffer, 0, byteOffset);
								totalLen += byteOffset;
								if (totalLen > lengthLimit)
								{	throw new TooBigError('Data is too big');
								}
								if (chunks.length == 0)
								{	return chunk;
								}
								chunks.push(chunk);
							}
							if (chunks.length == 0)
							{	return new Uint8Array;
							}
							if (chunks.length == 1)
							{	return chunks[0];
							}
							const result = new Uint8Array(totalLen);
							let pos = 0;
							for (const chunk of chunks)
							{	result.set(chunk, pos);
								pos += chunk.byteLength;
							}
							return result;
						}
						chunk = chunk.subarray(nRead);
					}
					const {byteOffset} = chunk;
					chunk = new Uint8Array(chunk.buffer, 0, byteOffset);
					totalLen += byteOffset;
					if (totalLen > lengthLimit)
					{	throw new TooBigError('Data is too big');
					}
					chunks.push(chunk);
					chunkSize *= 2;
				}
			}
		);
		return result ?? new Uint8Array;
	}

	/**	Reads the whole stream to memory, and converts it to string, just as `TextDecoder.decode()` does.
	 **/
	async text(label?: string, options?: TextDecoderOptions & {lengthLimit?: number})
	{	return new TextDecoder(label, options).decode(await this.uint8Array(options));
	}
}

class ReadableStreamIterator implements AsyncIterableIterator<Uint8Array>
{	constructor(private reader: ReadableStreamDefaultReader<Uint8Array>, private preventCancel: boolean)
	{
	}

	[Symbol.asyncIterator]()
	{	return this;
	}

	async next(): Promise<IteratorResult<Uint8Array>>
	{	const {value, done} = await this.reader.read();
		if (value?.byteLength || !done)
		{	return {value, done: false};
		}
		return await this.return();
	}

	// deno-lint-ignore require-await
	async return(value?: Uint8Array): Promise<IteratorResult<Uint8Array>>
	{	this[Symbol.dispose]();
		return {value, done: true};
	}

	throw(): Promise<IteratorResult<Uint8Array>>
	{	return this.return();
	}

	[Symbol.dispose]()
	{	try
		{	if (!this.preventCancel)
			{	this.reader.cancel();
			}
		}
		finally
		{	this.reader.releaseLock();
		}
	}
}
