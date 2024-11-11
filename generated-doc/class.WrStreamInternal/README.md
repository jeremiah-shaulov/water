# `class` WrStreamInternal `extends` WritableStream\<Uint8Array>

[Documentation Index](../README.md)

## This class has

- [constructor](#-constructorsink-sinkinternal)
- 3 properties:
[locked](#-get-locked-boolean),
[isClosed](#-get-isclosed-boolean),
[closed](#-get-closed-promiseundefined)
- 6 methods:
[getWriter](#-getwriter-writablestreamdefaultwriteruint8array--writer),
[getWriterWhenReady](#-getwriterwhenready-promisewritablestreamdefaultwriteruint8array--writer),
[abort](#-abortreason-unknown-promisevoid),
[close](#-close-promisevoid),
[write](#-writechunk-uint8array--string-promisevoid),
[flush](#-flush-promisevoid)
- [deprecated symbol](#-deprecated-writewhenreadychunk-uint8array--string-promisevoid)


#### 🔧 `constructor`(sink: [SinkInternal](../private.type.SinkInternal/README.md))



#### 📄 `get` locked(): `boolean`

> When somebody wants to start writing to this stream, he calls `wrStream.getWriter()`, and after that call the stream becomes locked.
> Future calls to `wrStream.getWriter()` will throw error till the writer is released (`writer.releaseLock()`).
> 
> Other operations that write to the stream (like `wrStream.write()`) also lock it (internally they get writer, and release it later).



#### 📄 `get` isClosed(): `boolean`



#### 📄 `get` closed(): Promise\<`undefined`>



#### ⚙ getWriter(): WritableStreamDefaultWriter\<Uint8Array> \& Writer

> Returns object that allows to write data to the stream.
> The stream becomes locked till this writer is released by calling `writer.releaseLock()` or `writer[Symbol.dispose]()`.
> 
> If the stream is already locked, this method throws error.



#### ⚙ getWriterWhenReady(): Promise\<WritableStreamDefaultWriter\<Uint8Array> \& Writer>

> Like `wrStream.getWriter()`, but waits for the stream to become unlocked before returning the writer (and so locking it again).



#### ⚙ abort(reason?: `unknown`): Promise\<`void`>

> Interrupt current writing operation (reject the promise that `writer.write()` returned, if any),
> and set the stream to error state.
> This leads to calling `sink.abort(reason)`, even if current `sink.write()` didn't finish.
> `sink.abort()` is expected to interrupt or complete all the current operations,
> and finalize the sink, as no more callbacks will be called.
> 
> In contrast to `WritableStream.abort()`, this method works even if the stream is locked.



#### ⚙ close(): Promise\<`void`>

> Calls `sink.close()`. After that no more callbacks will be called.
> If `close()` called again on already closed stream, nothing happens (no error is thrown).



#### ⚙ write(chunk?: Uint8Array | `string`): Promise\<`void`>

> Waits for the stream to be unlocked, gets writer (locks the stream),
> writes the chunk, and then releases the writer (unlocks the stream).
> This is the same as doing:
> ```ts
> {	using writer = await wrStream.getWriterWhenReady();
> 	await writer.write(chunk);
> }
> ```



#### ⚙ flush(): Promise\<`void`>

> Waits for the stream to be unlocked, gets writer (locks the stream),
> flushes the stream, and then releases the writer (unlocks the stream).
> This is the same as doing:
> ```ts
> {	using writer = await wrStream.getWriterWhenReady();
> 	await writer.flush();
> }
> ```



<div style="opacity:0.6">

#### ⚙ `deprecated` writeWhenReady(chunk: Uint8Array | `string`): Promise\<`void`>

> Use `write()` instead.



</div>

