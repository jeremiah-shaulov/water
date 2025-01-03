# `class` Reader `extends` [ReaderOrWriter](../class.ReaderOrWriter/README.md)\<[ReadCallbackAccessor](../private.class.ReadCallbackAccessor/README.md)>

[Documentation Index](../README.md)

```ts
import {Reader} from "https://deno.land/x/water@v1.0.26/mod.ts"
```

This class plays the same role in `RdStream` as does `ReadableStreamBYOBReader` in `ReadableStream<Uint8Array>`.

## This class has

- [constructor](#-constructorcallbackaccessor-somecallbackaccessor--undefined-onrelease-voidfunction)
- property [capNoTransferRead](#-readonly-capnotransferread-true)
- 11 methods:
[read](#-read-promiseitresultopt),
[read](#-readv-extends-arraybufferviewview-v-promiseitresultopt),
[cancel](#-cancelreason-unknown-promisevoid),
[unread](#-unreadchunk-uint8array-void),
[values](#-valuesoptions-preventcancel-boolean-readablestreamiterator),
[tee](#-teeoptions-requireparallelread-boolean-rdstream-rdstream),
[pipeTo](#-pipetodest-writablestreamuint8array-options-streampipeoptionslocal-promisevoid),
[pipeThrough](#-pipethrought-w-extends-writablestreamuint8array-r-extends-readablestreamttransform-readonly-writable-w-readonly-readable-r-options-streampipeoptionslocal-r),
[uint8Array](#-uint8arrayoptions-lengthlimit-number-promiseuint8array),
[text](#-textlabel-string-options-textdecoderoptions--lengthlimit-number-promisestring),
[\[Symbol.asyncIterator\]](#-symbolasynciteratoroptions-preventcancel-boolean-readablestreamiterator)
- 7 inherited members from [ReaderOrWriter](../class.ReaderOrWriter/README.md)


#### 🔧 `constructor`(callbackAccessor: SomeCallbackAccessor | `undefined`, onRelease: VoidFunction)



#### 📄 `readonly` capNoTransferRead: `true`

> Declares that this object is capable of no-transfer read. This allows the user to distinguish
> between built-in `ReadableStreamDefaultReader` (`ReadableStreamBYOBReader`) and this object.
> 
> ```ts
> 	function task(rs: ReadableStream<Uint8Array>)
> 	{	const reader = rs.getReader();
> 		try
> 		{	if ('capNoTransferRead' in reader)
> 			{	// Use more efficient algorithm
> 			}
> 			else
> 			{	// Use less efficient algorithm
> 			}
> 		}
> 		finally
> 		{	reader.releaseLock();
> 		}
> 	}
> ```



#### ⚙ read(): Promise\<ItResultOpt>



#### ⚙ read\<V `extends` ArrayBufferView>(view: V): Promise\<ItResultOpt>



#### ⚙ cancel(reason?: `unknown`): Promise\<`void`>



#### ⚙ unread(chunk: Uint8Array): `void`

> Push chunk to the stream, so next read will get it.
> This creates internal buffer, and copies the chunk contents to it.



#### ⚙ values(options?: \{preventCancel?: `boolean`}): [ReadableStreamIterator](../private.class.ReadableStreamIterator/README.md)

> Allows you to iterate this stream yielding `Uint8Array` data chunks.



#### ⚙ tee(options?: \{requireParallelRead?: `boolean`}): \[[RdStream](../class.RdStream/README.md), [RdStream](../class.RdStream/README.md)]

> Splits the stream to 2, so the rest of the data can be read from both of the resulting streams.
> 
> If you'll read from one stream faster than from another, or will not read at all from one of them,
> the default behavior is to buffer the data.
> 
> If `requireParallelRead` option is set, the buffering will be disabled,
> and parent stream will suspend after each item, till it's read by both of the child streams.
> In this case if you read and await from the first stream, without previously starting reading from the second,
> this will cause a deadlock situation.



#### ⚙ pipeTo(dest: WritableStream\<Uint8Array>, options?: [StreamPipeOptionsLocal](../private.interface.StreamPipeOptionsLocal/README.md)): Promise\<`void`>

> Pipe data from this stream to `dest` writable stream (that can be built-in `WritableStream<Uint8Array>` or `WrStream`).
> 
> If the data is piped to EOF without error, the source readable stream is closed as usual (`close()` callback is called on `Source`),
> and the writable stream will be closed unless `preventClose` option is set.
> 
> If destination closes or enters error state, then `pipeTo()` throws exception.
> But then `pipeTo()` can be called again to continue piping the rest of the stream to another destination (including previously buffered data).



#### ⚙ pipeThrough\<T, W `extends` WritableStream\<Uint8Array>, R `extends` ReadableStream\<T>>(transform: \{`readonly` writable: W, `readonly` readable: R}, options?: [StreamPipeOptionsLocal](../private.interface.StreamPipeOptionsLocal/README.md)): R

> Uses `reader.pipeTo()` to pipe the data to transformer's writable stream, and returns transformer's readable stream.
> 
> The transformer can be an instance of built-in `TransformStream<Uint8Array, unknown>`, `TrStream`, or any other `writable/readable` pair.



#### ⚙ uint8Array(options?: \{lengthLimit?: `number`}): Promise\<Uint8Array>

> Reads the whole stream to memory.
> If `lengthLimit` is specified (and is positive number), and the stream happens to be bigger than this number,
> a `TooBigError` exception is thrown.



#### ⚙ text(label?: `string`, options?: TextDecoderOptions \& \{lengthLimit?: `number`}): Promise\<`string`>

> Reads the whole stream to memory, and converts it to string, just as `TextDecoder.decode()` does.



#### ⚙ \[Symbol.asyncIterator](options?: \{preventCancel?: `boolean`}): [ReadableStreamIterator](../private.class.ReadableStreamIterator/README.md)

> Allows you to iterate this stream yielding `Uint8Array` data chunks.



