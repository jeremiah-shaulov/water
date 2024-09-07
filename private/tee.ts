import {ItResultOpt} from './common.ts';
import {_useLowLevelCallbacks} from './wr_stream.ts';

export class TeeRegular
{	#promise = Promise.resolve();
	#buffered = new Uint8Array;
	#bufferedFor: -1|0|1 = 0;
	#isEof = false;
	#cancelledNReader: -1|0|1 = 0;

	constructor(private reader: ReadableStreamBYOBReader)
	{
	}

	async read(view: Uint8Array, nReader: -1|1)
	{	if (this.#bufferedFor == nReader)
		{	// Have something buffered for me
			await this.#promise;
			const wantLen = this.#buffered.byteLength;
			if (wantLen==0 && this.#isEof)
			{	// Eof
				return null;
			}
			// Data
			const hasLen = view.byteLength;
			const len = Math.min(wantLen, hasLen);
			view.set(this.#buffered.subarray(0, len));
			if (len < wantLen)
			{	this.#buffered = this.#buffered.subarray(len);
			}
			else
			{	this.#buffered = new Uint8Array(this.#buffered.buffer, 0, 0);
			}
			this.#bufferedFor = 0;
			return len;
		}
		else
		{	// Read from the underlying reader
			this.#bufferedFor = -nReader as -1|1;
			let resolve: VoidFunction|undefined;
			if (this.#bufferedFor != this.#cancelledNReader)
			{	this.#promise = new Promise<void>(y => {resolve = y});
			}
			const {value, done} = await this.reader.read(view);
			resolve?.();
			if (done)
			{	this.#isEof = true;
				return null;
			}
			if (this.#bufferedFor != this.#cancelledNReader)
			{	// Buffer for the second reader
				const curLen = this.#buffered.byteLength;
				const newLen = curLen + value.byteLength;
				const totalLen = this.#buffered.buffer.byteLength;
				const {byteOffset} = this.#buffered;
				let newBuffered;
				if (totalLen < newLen)
				{	// The current buffer is too small (so allocate new and copy data from old)
					newBuffered = new Uint8Array(curLen==0 ? value.buffer.byteLength : bufferSizeFor(newLen)).subarray(0, newLen);
					newBuffered.set(this.#buffered);
				}
				else if (totalLen-byteOffset < newLen)
				{	// Space in the current buffer after the current content is too small (so enlarge view region and copyWithin)
					newBuffered = new Uint8Array(this.#buffered.buffer, 0, newLen);
					if (byteOffset > 0)
					{	new Uint8Array(this.#buffered.buffer, 0, totalLen).copyWithin(0, byteOffset, byteOffset+curLen);
					}
				}
				else
				{	// There's space after the current content (so enlarge view region)
					newBuffered = new Uint8Array(this.#buffered.buffer, byteOffset, newLen);
				}
				newBuffered.set(value, curLen);
				this.#buffered = newBuffered;
			}
			return value.byteLength;
		}
	}

	cancel(reason: unknown, nReader: -1|1)
	{	if (this.#cancelledNReader == 0)
		{	this.#cancelledNReader = nReader;
			if (this.#bufferedFor == nReader)
			{	this.#buffered = new Uint8Array;
			}
		}
		else
		{	this.reader.cancel(reason);
		}
	}
}

export class TeeRequireParallelRead
{	#doingNReader: -1|0|1 = 0;
	#promise = Promise.resolve({} as ItResultOpt<Uint8Array>);
	#resolve: VoidFunction|undefined;
	#secondReaderOffset = 0;
	#cancelledNReader: -1|0|1 = 0;

	constructor(private reader: ReadableStreamBYOBReader)
	{
	}

	async read(view: Uint8Array, nReader: -1|1)
	{	if (nReader == this.#cancelledNReader)
		{	return null;
		}
		// Assume: nReader is not cancelled (on next await this can cahnge)
		this.#doingNReader = nReader;
		if (!this.#resolve)
		{	// First reader
			this.#secondReaderOffset = 0;
			this.#promise = this.reader.read(view);
			const promise2 = this.#cancelledNReader==-nReader ? undefined : new Promise<void>(y => {this.#resolve = y});
			const {value, done} = await this.#promise;
			// Wait for the second reader
			if (promise2)
			{	await promise2;
			}
			// Return
			return done ? null : value.byteLength;
		}
		else
		{	// Second reader
			const {value, done} = await this.#promise; // get the result of the first reader
			if (done)
			{	this.#resolve();
				this.#resolve = undefined;
				return null;
			}
			const wantLen = value.byteLength - this.#secondReaderOffset;
			const hasLen = view.byteLength;
			const len = Math.min(wantLen, hasLen);
			view.set(value.subarray(this.#secondReaderOffset, this.#secondReaderOffset+len));
			if (len < wantLen)
			{	// Target buffer is too small, so i return without releasing the first read (`resolve()`), and wait for another read from the second reader.
				this.#secondReaderOffset += len;
				return len;
			}
			this.#resolve();
			this.#resolve = undefined;
			return len;
		}
	}

	cancel(reason: unknown, nReader: -1|1)
	{	if (this.#cancelledNReader == 0)
		{	this.#cancelledNReader = nReader;
			if (this.#resolve && this.#doingNReader!=nReader)
			{	this.#resolve();
				this.#resolve = undefined;
			}
		}
		else
		{	this.reader.cancel(reason);
		}
	}
}

function bufferSizeFor(dataSize: number)
{	let bufferSize = 1024;
	while (bufferSize < dataSize)
	{	bufferSize *= 2;
	}
	return bufferSize;
}
