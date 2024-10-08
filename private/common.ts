/**	By default min chunk size will be 1/8 of it.
 **/
export const DEFAULT_AUTO_ALLOCATE_SIZE = 32*1024;

export type ItResultValue<T> = {done: false, value: T}; // Built-in types in deno libraries are frequently renamed and changed, so i need to have my own definitions
export type ItResultDone<T> = {done: true, value: T|undefined};
export type ItResult<T> = ItResultValue<T> | ItResultDone<T>;

export type ItResultDoneOpt<T> = {done: true, value?: T};
export type ItResultOpt<T> = ItResultValue<T> | ItResultDoneOpt<T>;

export type Callbacks =
{	start?(): void | PromiseLike<void>;
	read?(view: Uint8Array): number | null | PromiseLike<number|null>;
	write?(chunk: Uint8Array, canReturnZero: boolean): number | PromiseLike<number>;
	flush?(): void | PromiseLike<void>;
	close?(): void | PromiseLike<void>;
	cancel?(reason: unknown): void | PromiseLike<void>;
	abort?(reason: unknown): void | PromiseLike<void>;
	catch?(reason: unknown): void | PromiseLike<void>;
	finally?(): void | PromiseLike<void>;
};

export class CallbackAccessor
{	closed: Promise<undefined>; // Definition in deno built-in type is recently changed from `Promise<void>` to `Promise<undefined>`
	error: unknown;
	ready: Promise<undefined>; // Definition in deno built-in type is recently changed from `Promise<void>` to `Promise<undefined>`
	waitBeforeClose: Promise<unknown>|undefined; // Promise that will be awaited before closing the stream. It must not throw (reject).
	#callbacks: Callbacks|undefined;
	#cancelCurOp: ((value?: undefined) => void) | undefined;
	#reportClosed: ((value?: undefined) => void) | undefined;
	#reportClosedWithError: ((error: unknown) => void) | undefined;

	get isClosed()
	{	return !this.#callbacks;
	}

	constructor(callbacks: Callbacks, private useAbortNotCancel: boolean)
	{	this.#callbacks = callbacks;
		this.closed = new Promise<undefined>
		(	(y, n) =>
			{	this.#reportClosed = y;
				this.#reportClosedWithError = n;
			}
		);
		this.closed.then(undefined, () => {});
		const startPromise = callbacks.start?.(); // can throw before returning promise, and this should break the constructor, because this is the behavior of `ReadableStream`
		if (startPromise)
		{	this.ready = new Promise<void>
			(	y =>
				{	startPromise.then
					(	y,
						e =>
						{	this.error = e;
							this.close().then(y, y);
						}
					);
				}
			) as Promise<undefined>;
		}
		else
		{	this.ready = Promise.resolve(undefined);
		}
	}

	useCallbacks<T>(useCallbacks: (callbacks: Callbacks) => T | PromiseLike<T>)
	{	if (this.#callbacks)
		{	const promise = this.ready.then
			(	() =>
				{	const callbacks = this.#callbacks;
					if (callbacks)
					{	try
						{	const resultOrPromise = useCallbacks(callbacks);
							if (typeof(resultOrPromise)=='object' && resultOrPromise!=null && 'then' in resultOrPromise)
							{	return resultOrPromise.then
								(	undefined,
									e =>
									{	this.error = e;
										return this.close().then(() => Promise.reject(e), () => Promise.reject(e));
									}
								);
							}
							else
							{	return resultOrPromise;
							}
						}
						catch (e)
						{	this.error = e;
							return this.close().then(() => Promise.reject(e), () => Promise.reject(e));
						}
					}
					else if (this.error != undefined)
					{	throw this.error;
					}
				}
			);
			this.ready = promise.then(undefined, () => undefined);
			return new Promise<T | undefined>
			(	(y, n) =>
				{	this.#cancelCurOp = y;
					promise.then(y, n);
				}
			);
		}
		else if (this.error != undefined)
		{	throw this.error;
		}
	}

	schedule<T>(task: () => T | PromiseLike<T>)
	{	const promise = this.ready.then(task);
		this.ready = promise.then(undefined, () => undefined);
		return promise;
	}

	async close(isCancelOrAbort=false, reason?: unknown)
	{	const waitBeforeClose = this.waitBeforeClose;
		const callbacks = this.#callbacks;
		let cancelCurOp = this.#cancelCurOp;
		const reportClosed = this.#reportClosed;
		const reportClosedWithError = this.#reportClosedWithError;

		this.waitBeforeClose = undefined;
		this.#callbacks = undefined; // don't call callbacks anymore
		this.#cancelCurOp = undefined;
		this.#reportClosed = undefined;
		this.#reportClosedWithError = undefined;

		if (waitBeforeClose)
		{	await waitBeforeClose; // must not throw (reject)
		}

		if (this.error == undefined)
		{	if (!isCancelOrAbort)
			{	if (callbacks?.close)
				{	try
					{	await callbacks.close();
						reportClosed?.();
					}
					catch (e)
					{	this.error = e;
					}
				}
				else
				{	reportClosed?.();
				}
			}
			else
			{	let promise;
				try
				{	if (callbacks)
					{	if (this.useAbortNotCancel)
						{	promise = callbacks.abort?.(reason);
						}
						else if (callbacks.cancel)
						{	promise = callbacks.cancel(reason);
						}
						else
						{	promise = this.schedule
							(	async () =>
								{	const buffer = new Uint8Array(DEFAULT_AUTO_ALLOCATE_SIZE);
									while (true)
									{	const nRead = await callbacks.read!(buffer);
										if (!nRead)
										{	break;
										}
									}
								}
							);
						}
					}
				}
				catch (e)
				{	this.error = e;
				}
				cancelCurOp?.();
				cancelCurOp = undefined;
				if (this.error == undefined)
				{	reportClosed?.();
				}
				if (promise)
				{	try
					{	await promise;
					}
					catch (e)
					{	this.error = e;
					}
				}
			}
		}

		if (this.error!=undefined && callbacks?.catch)
		{	try
			{	if (isCancelOrAbort) // `cancel()` and `abort()` work not inside `useCallbacks()`
				{	await this.schedule(() => callbacks.catch!(this.error));
				}
				else
				{	await callbacks.catch(this.error);
				}
			}
			catch
			{	// ok
			}
		}

		if (callbacks?.finally)
		{	try
			{	if (isCancelOrAbort) // `cancel()` and `abort()` work not inside `useCallbacks()`
				{	await this.schedule(() => callbacks.finally!());
				}
				else
				{	await callbacks.finally();
				}
			}
			catch (e)
			{	try
				{	await callbacks.catch?.(e);
				}
				catch
				{	// ok
				}
			}
		}

		if (this.error != undefined)
		{	reportClosedWithError?.(this.error);
			throw this.error;
		}
	}
}

export class ReaderOrWriter<SomeCallbackAccessor extends CallbackAccessor>
{	constructor(protected callbackAccessor: SomeCallbackAccessor|undefined, private onRelease: VoidFunction)
	{
	}

	protected getCallbackAccessor()
	{	const {callbackAccessor} = this;
		if (!callbackAccessor)
		{	throw new TypeError('Reader or writer has no associated stream.');
		}
		return callbackAccessor;
	}

	get isClosed()
	{	return !this.callbackAccessor ? true : this.callbackAccessor.isClosed;
	}

	get closed()
	{	return !this.callbackAccessor ? Promise.resolve(undefined) : this.callbackAccessor.closed;
	}

	releaseLock()
	{	if (this.callbackAccessor)
		{	this.callbackAccessor = undefined;
			this.onRelease();
		}
	}

	[Symbol.dispose]()
	{	this.releaseLock();
	}
}
