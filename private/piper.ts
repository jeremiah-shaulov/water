import {Callbacks} from './common.ts';

export class Piper
{	private readPos = 0; // read to `buffer[readPos ..]`
	private writePos = 0; // write from `buffer[writePos .. readPos]`
	private readPos2 = 0; // when `readPos > readTo` read to `buffer[readPos2 .. writePos]` over already read and written part of the buffer on the left of `writePos`
	private usingReadPos2 = false; // where do i read to? to `readPos` or `readPos2`
	private readPromise: number | null | PromiseLike<number|null> | undefined; // pending read operation that reads to the buffer
	private isEof = false; // i'll not read (i.e. create `readPromise`) if EOF reached

	constructor(private buffer: Uint8Array, private autoAllocateMin: number)
	{
	}

	async pipeTo
	(	writerClosedPromise: Promise<void>,
		callbacksForRead: Callbacks,
		callbackWriteInverting: (chunk: Uint8Array, canReturnZero: boolean) => number | PromiseLike<number>,
	)
	{	let {buffer, autoAllocateMin, readPos, writePos, readPos2, usingReadPos2, readPromise, isEof} = this;
		let bufferSize = buffer.byteLength;
		let halfBufferSize = bufferSize<2 ? bufferSize : bufferSize >> 1;
		let lastWriteCanReturnZero = true; // last write call was with `canReturnZero` flag
		let writePromise: number | PromiseLike<number> | undefined; // pending write operation that writes from the buffer
		let writerClosed = false;
		writerClosedPromise.then(() => {writerClosed = true}, () => {writerClosed = true});
		// Assume: 0 <= readPos2 <= writePos <= readPos <= bufferSize
		// Can read to `buffer[readPos .. bufferSize]`, and then to `buffer[readPos2 .. writePos]`
		// Can write from `buffer[writePos .. readPos]`, and then `buffer[0 .. readPos2]` will become `buffer[writePos .. readPos]` (will set readPos to readPos2, writePos to 0, and readPos2 to 0)
		try
		{	while (true)
			{	// writerClosed?
				if (writerClosed)
				{	if (writePromise)
					{	writePos = readPos;
					}
					return false;
				}
				// Start (or continue) reading and/or writing
				if (readPromise===undefined && !isEof)
				{	if (bufferSize-readPos >= autoAllocateMin) // If space at right is >= autoAllocateMin
					{	// Read to right
						usingReadPos2 = false;
						readPromise = callbacksForRead.read!
						(	readPos == 0 ?
								buffer.subarray(0, halfBufferSize) : // Don't try to read the full buffer, only it's half. The buffer is big enough (twice common size). This increases the chance that reading and writing will happen in parallel
								buffer.subarray(readPos)
						);
					}
					else if (writePos-readPos2 >= autoAllocateMin) // If space at left is >= autoAllocateMin
					{	// Read to left
						usingReadPos2 = true;
						readPromise = callbacksForRead.read!(buffer.subarray(readPos2, writePos));
					}
				}
				if (writePromise===undefined && readPos>writePos)
				{	// Write if there's something already read in the buffer
					lastWriteCanReturnZero = !isEof || readPos2!=0;
					writePromise = callbackWriteInverting(buffer.subarray(writePos, readPos), lastWriteCanReturnZero);
				}
				// Await for the fastest promise
				let size =
				(	typeof(readPromise)=='number' || readPromise===null ? // If result is ready (not promise)
						readPromise :
					typeof(writePromise)=='number' ? // If result is ready (not promise)
						writePromise :
						await (!readPromise ? writePromise : !writePromise ? readPromise : Promise.race([readPromise, writePromise]))
				);
				// Now we have either read or written something
				if (!size)
				{	// Read EOF
					readPromise = undefined;
					isEof = true;
					if (!writePromise)
					{	if (!usingReadPos2 || readPos2==0)
						{	return true;
						}
						readPos = readPos2;
						readPos2 = 0;
						writePos = 0;
					}
				}
				else if (size > 0)
				{	// Read a chunk
					readPromise = undefined;
					if (!usingReadPos2)
					{	// Read from `readPos` to `readPos + size`
						readPos += size;
					}
					else
					{	// Read from `readPos2` to `readPos2 + size`
						readPos2 += size;
						if (readPos == writePos)
						{	readPos = readPos2;
							readPos2 = 0;
							writePos = 0;
						}
					}
				}
				else
				{	// Written
					size = -size - 1;
					writePromise = undefined;
					if (size > 0)
					{	writePos += size;
						if (readPos==writePos && !readPromise)
						{	readPos = readPos2;
							readPos2 = 0;
							writePos = 0;
							if (isEof && readPos==0)
							{	return true;
							}
						}
					}
					else
					{	// They want a larger chunk
						if (readPromise)
						{	// writerClosed?
							if (writerClosed)
							{	writePos = readPos;
								return false;
							}
							// Read
							size = await readPromise;
							readPromise = undefined;
							if (!size)
							{	// Read EOF
								isEof = true;
							}
							else if (!usingReadPos2)
							{	// Read from `readPos` to `readPos + size`
								readPos += size;
								continue;
							}
							else
							{	// Read from `readPos2` to `readPos2 + size`
								readPos2 += size;
							}
						}
						const holeSize = bufferSize - readPos;
						if (holeSize > 0) // If there's hole on the right (because i prefer to read to the left when there's more space)
						{	if (readPos2 > 0)  // If there's something read on the left
							{	// Move the data from left to right
								const copySize = Math.min(holeSize, readPos2);
								buffer.copyWithin(readPos, 0, copySize);
								buffer.copyWithin(0, copySize, readPos2);
								readPos += copySize;
								readPos2 -= copySize;
							}
							else if (isEof)
							{	if (!lastWriteCanReturnZero)
								{	throw new Error(`write() returned 0 during pipeTo() when there're no more data`);
								}
								// Call write callback again with `!canReturnZero`
							}
							else
							{	size = await callbacksForRead.read!(buffer.subarray(readPos)); // Read to the hole
								if (!size)
								{	// Read EOF
									isEof = true;
								}
								else
								{	// Read from `readPos` to `readPos + size`
									readPos += size;
								}
							}
						}
						else if (writePos > 0)
						{	if (readPos2 > 0)  // If there's something read on the left
							{	const leftPart = buffer.slice(0, readPos2);
								readPos2 = 0;
								buffer.copyWithin(0, writePos, readPos);
								readPos -= writePos;
								writePos = 0;
								buffer.set(leftPart, readPos);
								readPos += leftPart.byteLength;
							}
							else if (isEof)
							{	if (!lastWriteCanReturnZero)
								{	throw new Error(`write() returned 0 during pipeTo() when there're no more data`);
								}
								// Call write callback again with `!canReturnZero`
							}
							else
							{	buffer.copyWithin(0, writePos, readPos);
								readPos -= writePos;
								writePos = 0;
								usingReadPos2 = false;
								size = await callbacksForRead.read!(buffer.subarray(readPos)); // Read
								if (!size)
								{	// Read EOF
									isEof = true;
								}
								else
								{	// Read from `readPos` to `readPos + size`
									readPos += size;
								}
							}
						}
						else
						{	// Assume: `readPos == bufferSize` (because `holeSize==0` above)
							// Assume: `writePos == 0` (see above)
							// Assume: `readPos2 == 0` (because `0 <= readPos2 <= writePos`)
							if (!isEof)
							{	// The buffer is full, but not EOF, so enlarge the buffer
								halfBufferSize = bufferSize;
								bufferSize *= 2;
								const tmp = new Uint8Array(bufferSize);
								tmp.set(buffer);
								buffer = tmp;
							}
							else
							{	if (!lastWriteCanReturnZero)
								{	throw new Error(`write() returned 0 for ${bufferSize} bytes chunk during pipeTo()`);
								}
								lastWriteCanReturnZero = false;
								writePromise = callbackWriteInverting(buffer.subarray(writePos, readPos), lastWriteCanReturnZero);
							}
						}
					}
				}
			}
		}
		catch (e)
		{	// Await writePromise
			if (typeof(writePromise) == 'object')
			{	try
				{	await writePromise;
				}
				catch
				{	// ok
				}
			}
			// Rethrow
			throw e;
		}
		finally
		{	this.buffer = buffer;
			this.readPos = readPos;
			this.writePos = writePos;
			this.readPos2 = readPos2;
			this.usingReadPos2 = usingReadPos2;
			this.readPromise = readPromise;
			this.isEof = isEof;
		}
	}

	read(view: Uint8Array)
	{	const {readPos, writePos, readPos2} = this;
		if (writePos < readPos)
		{	const {buffer} = this;
			let nRead = Math.min(view.byteLength, readPos-writePos);
			const nextWritePos = writePos + nRead;
			view.set(buffer.subarray(writePos, nextWritePos));
			if (nextWritePos == readPos)
			{	this.readPos2 = 0;
				this.writePos = 0;
				if (nRead+readPos2 <= view.byteLength)
				{	view.set(buffer.subarray(0, readPos2));
					nRead += readPos2;
					this.readPos = 0;
				}
				else
				{	this.readPos = readPos2;
				}
			}
			else
			{	this.writePos = nextWritePos;
			}
			return view.subarray(0, nRead);
		}
	}

	unread(chunk: Uint8Array)
	{	// Assume: 0 <= readPos2 <= writePos <= readPos <= bufferSize
		// Can read to `buffer[readPos .. bufferSize]`, and then to `buffer[readPos2 .. writePos]`
		// Can write from `buffer[writePos .. readPos]`, and then `buffer[0 .. readPos2]` will become `buffer[writePos .. readPos]` (will set readPos to readPos2, writePos to 0, and readPos2 to 0)
		const {buffer, readPos, writePos, readPos2} = this;
		const bufferSize = buffer.byteLength;
		const chunkSize = chunk.byteLength;
		const occupiedAtRight = readPos - writePos;
		const occupied = readPos2 + occupiedAtRight;
		if (bufferSize-occupied < chunkSize)
		{	// Grow buffer, and copy to it the `chunk` + current data
			const buffer2 = new Uint8Array(chunkSize + occupied);
			buffer2.set(chunk);
			buffer2.set(buffer.subarray(writePos, readPos), chunkSize);
			buffer2.set(buffer.subarray(0, readPos2), chunkSize + occupiedAtRight);
			this.buffer = buffer2;
			this.readPos2 = 0;
			this.writePos = 0;
			this.readPos = buffer2.byteLength;
		}
		else if (writePos >= chunkSize)
		{	// Write the chunk to the space before `writePos`
			if (writePos-readPos2 < chunkSize)
			{	// Move from `buffer[0 .. readPos2]` to `buffer[readPos .. bufferSize]` as much as possible.
				// And if it's not possible to move all, this means that there's only one free range remaining, and it's before `writePos`.
				// And since we decided not to enlarge the buffer, tis means that there's enough space for the chunk before `writePos`.
				const toRight = Math.min(bufferSize-readPos, readPos2);
				buffer.copyWithin(readPos, 0, toRight);
				buffer.copyWithin(0, toRight, readPos2);
				this.readPos = readPos + toRight;
				this.readPos2 = readPos2 - toRight;
			}
			const newWritePos = writePos - chunkSize;
			buffer.set(chunk, newWritePos);
			this.writePos = newWritePos;
		}
		else if (readPos2 == 0)
		{	// The chunk cannot be written to the space before `writePos`, so move `buffer[writePos .. readPos]` to the right
			buffer.copyWithin(chunkSize, writePos, readPos);
			buffer.set(chunk);
			this.writePos = 0;
			this.readPos = chunkSize + (readPos - writePos);
		}
		else
		{	// The chunk cannot be written to the space before `writePos`, so move `buffer[writePos .. readPos]` to the right
			let newWritePos = bufferSize - occupiedAtRight;
			buffer.copyWithin(newWritePos, writePos, readPos);
			newWritePos -= chunkSize;
			buffer.set(chunk, newWritePos);
			this.writePos = newWritePos;
			this.readPos = bufferSize;
		}
	}

	unwrap()
	{	const {buffer, readPos, writePos, readPos2} = this;
		if (readPos2 == 0)
		{	return buffer.subarray(writePos, readPos);
		}
		else if (buffer.byteLength-readPos >= readPos2)
		{	buffer.copyWithin(readPos, 0, readPos2);
			return buffer.subarray(writePos, readPos+readPos2);
		}
		else if (readPos2 + (readPos-writePos) + readPos2 <= buffer.byteLength)
		{	buffer.copyWithin(readPos2, writePos, readPos);
			buffer.copyWithin(readPos2 + (readPos-writePos), 0, readPos2);
			return buffer.subarray(readPos2, readPos2 + (readPos-writePos) + readPos2);
		}
		else
		{	const left = buffer.slice(0, readPos2);
			buffer.copyWithin(0, writePos, readPos);
			buffer.set(left, readPos - writePos);
			return buffer.subarray(0, readPos2 + (readPos-writePos));
		}
	}

	dispose()
	{	return this.buffer;
	}
}
