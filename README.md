<!--
	This file is generated with the following command:
	deno run --allow-all https://raw.githubusercontent.com/jeremiah-shaulov/tsa/v0.0.51/tsa.ts doc-md --outFile=README.md --outUrl=https://raw.githubusercontent.com/jeremiah-shaulov/water/v1.0.27/README.md --importUrl=https://deno.land/x/water@v1.0.27/mod.ts mod.ts
-->

# water - Alternative to ReadableStream, WritableStream and TransformStream.

[Documentation Index](generated-doc/README.md)

This library introduces 3 classes: [RdStream](generated-doc/class.RdStream/README.md), [WrStream](generated-doc/class.WrStream/README.md) and [TrStream](generated-doc/class.TrStream/README.md), that can be used in place of
[ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)`<Uint8Array>`,
[WritableStream](https://developer.mozilla.org/en-US/docs/Web/API/WritableStream)`<Uint8Array>` and
[TransformStream](https://developer.mozilla.org/en-US/docs/Web/API/TransformStream)`<Uint8Array, Uint8Array>`.

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

Implementing this interface is enough, however this is only a subset of the full [Source](generated-doc/type.Source/README.md) interface that is shown below.

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

- [RdStream.cancel()](generated-doc/class.RdStream/README.md#-override-cancelreason-unknown-promisevoid) and [WrStream.abort()](generated-doc/class.WrStreamInternal/README.md#-override-abortreason-unknown-promisevoid) work also on locked streams.
- [getReader()](generated-doc/class.RdStream/README.md#-override-getreaderoptions-mode-byob-readablestreambyobreader--omitreader-read) and [getWriter()](generated-doc/class.WrStreamInternal/README.md#-override-getwriter-writablestreamdefaultwriteruint8arrayarraybufferlike--writer) have [getReaderWhenReady()](generated-doc/class.RdStream/README.md#-getreaderwhenreadyoptions-mode-byob-promisereadablestreambyobreader--omitreader-read) and [getWriterWhenReady()](generated-doc/class.WrStreamInternal/README.md#-getwriterwhenready-promisewritablestreamdefaultwriteruint8arrayarraybufferlike--writer) counterparts, that wait for reader/writer to be unlocked.
- [RdStream.values()](generated-doc/class.RdStream/README.md#-override-valuesoptions-preventcancel-boolean-readablestreamiterator), [RdStream.tee()](generated-doc/class.RdStream/README.md#-override-teeoptions-requireparallelread-boolean-rdstream-rdstream), [RdStream.pipeTo()](generated-doc/class.RdStream/README.md#-override-pipetodest-writablestreamuint8array-options-streampipeoptionslocal-promisevoid) and [RdStream.pipeThrough()](generated-doc/class.RdStream/README.md#-override-pipethrought-w-extends-writablestreamuint8array-r-extends-readablestreamttransform-readonly-writable-w-readonly-readable-r-options-streampipeoptionslocal-r) are present in both [RdStream](generated-doc/class.RdStream/README.md) and [Reader](generated-doc/class.Reader/README.md).
- Also [RdStream](generated-doc/class.RdStream/README.md) and [Reader](generated-doc/class.Reader/README.md) have additional methods: [uint8Array()](generated-doc/class.RdStream/README.md#-uint8arrayoptions-lengthlimit-number-promiseuint8arrayarraybufferlike), [text()](generated-doc/class.RdStream/README.md#-textlabel-string-options-textdecoderoptions--lengthlimit-number-promisestring) and [unread()](generated-doc/class.RdStream/README.md#-unreadchunk-uint8array-void).
- [RdStream.pipeTo()](generated-doc/class.RdStream/README.md#-override-pipetodest-writablestreamuint8array-options-streampipeoptionslocal-promisevoid) and [RdStream.pipeThrough()](generated-doc/class.RdStream/README.md#-override-pipethrought-w-extends-writablestreamuint8array-r-extends-readablestreamttransform-readonly-writable-w-readonly-readable-r-options-streampipeoptionslocal-r) are restartable ([Transformer.transform()](generated-doc/type.Transformer/README.md#-transformwriter-writer-chunk-uint8array-canreturnzero-boolean-number--promiselikenumber) can close it's writer, and then the rest of the input stream can be piped to elsewhere).
- [Reader](generated-doc/class.Reader/README.md) and [Writer](generated-doc/class.Writer/README.md) implement `Symbol.dispose` that releases the lock.
- [WrStream](generated-doc/class.WrStream/README.md) has [flush](generated-doc/class.WrStreamInternal/README.md#-flush-promisevoid) feature.

## Exported classes and types

```ts
import {RdStream, Source} from 'https://deno.land/x/water@v1.0.27/mod.ts';
import {WrStream, Sink} from 'https://deno.land/x/water@v1.0.27/mod.ts';
import {TrStream, Transformer} from 'https://deno.land/x/water@v1.0.27/mod.ts';
import {TooBigError} from 'https://deno.land/x/water@v1.0.27/mod.ts';
```

- [RdStream](generated-doc/class.RdStream/README.md)
- [WrStream](generated-doc/class.WrStream/README.md)
- [TrStream](generated-doc/class.TrStream/README.md)

### class RdStream

This class extends [ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)`<Uint8Array>`.

An instance can be created from [Source](generated-doc/type.Source/README.md) definition (object that has `read()` method):

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

Or it can be created as wrapper on existing `ReadableStream` object. Here is another way of creating [RdStream](generated-doc/class.RdStream/README.md) that reads from stdin:

```ts
const rdStream = RdStream.from(Deno.stdin.readable);
```

Now `rdStream` and `Deno.stdin.readable` are the same by the means of `ReadableStream` (both have `getReader()`),
but `RdStream` also has features that `ReadableStream` doesn't have. For example [text()](generated-doc/class.RdStream/README.md#-textlabel-string-options-textdecoderoptions--lengthlimit-number-promisestring) function:

```ts
console.log(await rdStream.text());
```

Creating `RdStream` from `read()` implementors (like `new RdStream(Deno.stdin)`) is preferrable (because it works faster) than creating from another streams (like `RdStream.from(Deno.stdin.readable)`).
However note that `Deno.stdin` also implements `close()`, so the file descriptor will be closed after reading to the end.
To prevent this, use:

```ts
const rdStream = new RdStream({read: p => Deno.stdin.read(p)});
```

[RdStream.from()](generated-doc/class.RdStream/README.md#-static-override-fromrsource-asynciterabler--iterabler--promiseliker-readablestreamr--rdstream) also allows to create [RdStream](generated-doc/class.RdStream/README.md) instances from iterable objects that yield `Uint8Array` items (see [RdStream.from()](generated-doc/class.RdStream/README.md#-static-override-fromrsource-asynciterabler--iterabler--promiseliker-readablestreamr--rdstream)).

#### Example

The following example demonstrates readable stream that streams the string provided to it's constructor.

```ts
import {RdStream} from 'https://deno.land/x/water@v1.0.27/mod.ts';

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

> 🔧 RdStream.[constructor](generated-doc/class.RdStream/README.md#-constructorsource-source)(source: [Source](generated-doc/type.Source/README.md))

> `type` Source =<br>
> {<br>
> &nbsp; &nbsp; 📄 [autoAllocateChunkSize](generated-doc/type.Source/README.md#-autoallocatechunksize-number)?: `number`<br>
> &nbsp; &nbsp; 📄 [autoAllocateMin](generated-doc/type.Source/README.md#-autoallocatemin-number)?: `number`<br>
> &nbsp; &nbsp; ⚙ [start](generated-doc/type.Source/README.md#-start-void--promiselikevoid)?(): `void` | PromiseLike\<`void`><br>
> &nbsp; &nbsp; ⚙ [read](generated-doc/type.Source/README.md#-readview-uint8array-number--promiselikenumber)(view: Uint8Array): `number` | PromiseLike\<`number`><br>
> &nbsp; &nbsp; ⚙ [close](generated-doc/type.Source/README.md#-close-void--promiselikevoid)?(): `void` | PromiseLike\<`void`><br>
> &nbsp; &nbsp; ⚙ [cancel](generated-doc/type.Source/README.md#-cancelreason-unknown-void--promiselikevoid)?(reason: `unknown`): `void` | PromiseLike\<`void`><br>
> &nbsp; &nbsp; ⚙ [catch](generated-doc/type.Source/README.md#-catchreason-unknown-void--promiselikevoid)?(reason: `unknown`): `void` | PromiseLike\<`void`><br>
> &nbsp; &nbsp; ⚙ [finally](generated-doc/type.Source/README.md#-finally-void--promiselikevoid)?(): `void` | PromiseLike\<`void`><br>
> }

[RdStream](generated-doc/class.RdStream/README.md) instances are constructed from [Source](generated-doc/type.Source/README.md) objects, that have definition of how data stream is generated.

If there's [start()](generated-doc/type.Source/README.md#-start-void--promiselikevoid) method, it gets called immediately, even before the constructor returns, to let the stream generator to initialize itself.
If [start()](generated-doc/type.Source/README.md#-start-void--promiselikevoid) returned Promise, this Promise is awaited before calling [read()](generated-doc/type.Source/README.md#-readview-uint8array-number--promiselikenumber) for the first time.

The only mandatory [Source](generated-doc/type.Source/README.md) method is [read()](generated-doc/type.Source/README.md#-readview-uint8array-number--promiselikenumber). This method is called each time data is requested from the stream by consumer.
Calls to [read()](generated-doc/type.Source/README.md#-readview-uint8array-number--promiselikenumber) are sequential, and new call doesn't begin untill previous call is finished (it's promise is fulfilled).
When [read()](generated-doc/type.Source/README.md#-readview-uint8array-number--promiselikenumber) is called it must load bytes to provided buffer, and return number of bytes loaded.
To indicate EOF it can return either `0` or `null`.
It can return result asynchronously (`Promise` object) or synchronously (number or null result).

Stream consumer can read the stream in [regular or "BYOB" mode](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/getReader#mode).
In BYOB, the consumer provides it's own buffer, which is passed to [Reader.read()](generated-doc/class.Reader/README.md#-readv-extends-arraybufferviewview-v-promiseitresultopt).
This buffer can be of any non-zero size.
In regular mode a buffer of at least [autoAllocateMin](generated-doc/type.Source/README.md#-autoallocatemin-number) bytes is allocated (and passed to [Reader.read()](generated-doc/class.Reader/README.md#-readv-extends-arraybufferviewview-v-promiseitresultopt)).
The maximum auto-allocated buffer size is [autoAllocateChunkSize](generated-doc/type.Source/README.md#-autoallocatechunksize-number).

When [read()](generated-doc/type.Source/README.md#-readview-uint8array-number--promiselikenumber) returned EOF (`0` or `null`), [close()](generated-doc/type.Source/README.md#-close-void--promiselikevoid) gets called to finalize the stream generator.

If [read()](generated-doc/type.Source/README.md#-readview-uint8array-number--promiselikenumber) thrown exception, [catch()](generated-doc/type.Source/README.md#-catchreason-unknown-void--promiselikevoid) is called instead of [close()](generated-doc/type.Source/README.md#-close-void--promiselikevoid).
Also if [read()](generated-doc/type.Source/README.md#-readview-uint8array-number--promiselikenumber) successfully returned EOF, but then [close()](generated-doc/type.Source/README.md#-close-void--promiselikevoid) thrown exception, [catch()](generated-doc/type.Source/README.md#-catchreason-unknown-void--promiselikevoid) is also called.

Stream consumer can decide to cancel the stream by calling [RdStream.cancel()](generated-doc/class.RdStream/README.md#-override-cancelreason-unknown-promisevoid) or [Reader.cancel()](generated-doc/class.Reader/README.md#-cancelreason-unknown-promisevoid).
In this case [cancel()](generated-doc/type.Source/README.md#-cancelreason-unknown-void--promiselikevoid) callback gets called.
This is the only callback that can be called in the middle of [read()](generated-doc/type.Source/README.md#-readview-uint8array-number--promiselikenumber) work, when asynchronous [read()](generated-doc/type.Source/README.md#-readview-uint8array-number--promiselikenumber) didn't return, so it can tell [read()](generated-doc/type.Source/README.md#-readview-uint8array-number--promiselikenumber) to return earlier.
If [cancel()](generated-doc/type.Source/README.md#-cancelreason-unknown-void--promiselikevoid) thrown exception, [catch()](generated-doc/type.Source/README.md#-catchreason-unknown-void--promiselikevoid) is called as the last action.

#### Properties:

> 📄 `override` `get` RdStream.[locked](generated-doc/class.RdStream/README.md#-override-get-locked-boolean)(): `boolean`

When somebody wants to start reading this stream, he calls [RdStream.getReader()](generated-doc/class.RdStream/README.md#-override-getreaderoptions-mode-byob-readablestreambyobreader--omitreader-read), and after that call the stream becomes locked.
Future calls to `RdStream.rdStream.getReader()` will throw error till the reader is released ([Reader.releaseLock()](generated-doc/class.ReaderOrWriter/README.md#-releaselock-void)).

Other operations that read the stream (like [RdStream.pipeTo()](generated-doc/class.RdStream/README.md#-override-pipetodest-writablestreamuint8array-options-streampipeoptionslocal-promisevoid)) also lock it (internally they get reader, and release it later).

> 📄 `get` RdStream.[isClosed](generated-doc/class.RdStream/README.md#-get-isclosed-boolean)(): `boolean`

Becomes true when the stream is read to the end, or after [RdStream.cancel()](generated-doc/class.RdStream/README.md#-override-cancelreason-unknown-promisevoid) was called.

#### Methods:

> ⚙ `override` RdStream.[getReader](generated-doc/class.RdStream/README.md#-override-getreaderoptions-mode-byob-readablestreambyobreader--omitreader-read)(options: \{mode: <mark>"byob"</mark>}): ReadableStreamBYOBReader \& Omit\<Reader, <mark>"read"</mark>>

Returns object that allows to read data from the stream.
The stream becomes locked till this reader is released by calling [Reader.releaseLock()](generated-doc/class.ReaderOrWriter/README.md#-releaselock-void) or [Symbol.dispose()](generated-doc/class.ReaderOrWriter/README.md#-symboldispose-void).

If the stream is already locked, this method throws error.

> ⚙ RdStream.[getReaderWhenReady](generated-doc/class.RdStream/README.md#-getreaderwhenreadyoptions-mode-byob-promisereadablestreambyobreader--omitreader-read)(options: \{mode: <mark>"byob"</mark>}): Promise\<ReadableStreamBYOBReader \& Omit\<Reader, <mark>"read"</mark>>>

Like [getReader()](generated-doc/class.RdStream/README.md#-override-getreaderoptions-mode-byob-readablestreambyobreader--omitreader-read), but waits for the stream to become unlocked before returning the reader (and so locking it again).

> ⚙ `override` RdStream.[cancel](generated-doc/class.RdStream/README.md#-override-cancelreason-unknown-promisevoid)(reason?: `unknown`): Promise\<`void`>

Interrupt current reading operation (reject the promise that [Reader.read()](generated-doc/class.Reader/README.md#-readv-extends-arraybufferviewview-v-promiseitresultopt) returned, if any),
and tell to discard further data in the stream.
This leads to calling [Source.cancel(reason)](generated-doc/type.Source/README.md#-cancelreason-unknown-void--promiselikevoid), even if current [Source.read()](generated-doc/type.Source/README.md#-readview-uint8array-number--promiselikenumber) didn't finish.
[Source.cancel()](generated-doc/type.Source/README.md#-cancelreason-unknown-void--promiselikevoid) must implement the actual behavior on how to discard further data,
and finalize the source, as no more callbacks will be called.

In contrast to `ReadableStream.cancel()`, this method works even if the stream is locked.

> ⚙ RdStream.[unread](generated-doc/class.RdStream/README.md#-unreadchunk-uint8array-void)(chunk: Uint8Array): `void`

Push chunk to the stream, so next read will get it.
This creates internal buffer, and copies the chunk contents to it.

> ⚙ `override` RdStream.[\[Symbol.asyncIterator\]](generated-doc/class.RdStream/README.md#-override-symbolasynciteratoroptions-preventcancel-boolean-readablestreamiterator)(options?: \{preventCancel?: `boolean`}): [ReadableStreamIterator](generated-doc/private.class.ReadableStreamIterator/README.md)

> ⚙ `override` RdStream.[values](generated-doc/class.RdStream/README.md#-override-valuesoptions-preventcancel-boolean-readablestreamiterator)(options?: \{preventCancel?: `boolean`}): [ReadableStreamIterator](generated-doc/private.class.ReadableStreamIterator/README.md)

Allows to iterate this stream yielding `Uint8Array` data chunks.

Usually you want to use `for await...of` to iterate.

```ts
for await (const chunk of rdStream)
{	// ...
}
```

It's also possible to iterate manually. In this case you need to be "using" the iterator, or to call [releaseLock()](generated-doc/class.ReaderOrWriter/README.md#-releaselock-void) explicitly.

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

If the stream is locked, this method throws error. However you can do [getReaderWhenReady()](generated-doc/class.RdStream/README.md#-getreaderwhenreadyoptions-mode-byob-promisereadablestreambyobreader--omitreader-read), and call identical method on the reader.

> ⚙ `override` RdStream.[tee](generated-doc/class.RdStream/README.md#-override-teeoptions-requireparallelread-boolean-rdstream-rdstream)(options?: \{requireParallelRead?: `boolean`}): \[[RdStream](generated-doc/class.RdStream/README.md), [RdStream](generated-doc/class.RdStream/README.md)]

Splits the stream to 2, so the rest of the data can be read from both of the resulting streams.

If you'll read from one stream faster than from another, or will not read at all from one of them,
the default behavior is to buffer the data.

If `requireParallelRead` option is set, the buffering will be disabled,
and parent stream will suspend after each item, till it's read by both of the child streams.
In this case if you read and await from the first stream, without previously starting reading from the second,
this will cause a deadlock situation.

If the stream is locked, this method throws error. However you can do [getReaderWhenReady()](generated-doc/class.RdStream/README.md#-getreaderwhenreadyoptions-mode-byob-promisereadablestreambyobreader--omitreader-read), and call identical method on the reader.

> ⚙ `override` RdStream.[pipeTo](generated-doc/class.RdStream/README.md#-override-pipetodest-writablestreamuint8array-options-streampipeoptionslocal-promisevoid)(dest: WritableStream\<Uint8Array>, options?: [StreamPipeOptionsLocal](generated-doc/private.interface.StreamPipeOptionsLocal/README.md)): Promise\<`void`>

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

Pipe data from this stream to `dest` writable stream (that can be built-in `WritableStream<Uint8Array>` or [WrStream](generated-doc/class.WrStream/README.md)).

If the data is piped to EOF without error, the source readable stream is closed as usual ([close()](generated-doc/type.Source/README.md#-close-void--promiselikevoid) callback is called on [Source](generated-doc/type.Source/README.md)),
and the writable stream will be closed unless `preventClose` option is set.

If destination closes or enters error state, then [RdStream.pipeTo()](generated-doc/class.RdStream/README.md#-override-pipetodest-writablestreamuint8array-options-streampipeoptionslocal-promisevoid) throws exception.
But then [RdStream.pipeTo()](generated-doc/class.RdStream/README.md#-override-pipetodest-writablestreamuint8array-options-streampipeoptionslocal-promisevoid) can be called again to continue piping the rest of the input stream to another destination (including the chunk that previous [RdStream.pipeTo()](generated-doc/class.RdStream/README.md#-override-pipetodest-writablestreamuint8array-options-streampipeoptionslocal-promisevoid) failed to write).

If the stream is locked, this method throws error. However you can do [getReaderWhenReady()](generated-doc/class.RdStream/README.md#-getreaderwhenreadyoptions-mode-byob-promisereadablestreambyobreader--omitreader-read), and call identical method on the reader.

> ⚙ `override` RdStream.[pipeThrough](generated-doc/class.RdStream/README.md#-override-pipethrought-w-extends-writablestreamuint8array-r-extends-readablestreamttransform-readonly-writable-w-readonly-readable-r-options-streampipeoptionslocal-r)\<T, W `extends` WritableStream\<Uint8Array>, R `extends` ReadableStream\<T>>(transform: \{`readonly` writable: W, `readonly` readable: R}, options?: [StreamPipeOptionsLocal](generated-doc/private.interface.StreamPipeOptionsLocal/README.md)): R

Uses [RdStream.pipeTo()](generated-doc/class.RdStream/README.md#-override-pipetodest-writablestreamuint8array-options-streampipeoptionslocal-promisevoid) to pipe the data to transformer's writable stream, and returns transformer's readable stream.

The transformer can be an instance of built-in `TransformStream<Uint8Array, unknown>`, [TrStream](generated-doc/class.TrStream/README.md), or any other object that implements the `Transform` interface (has `writable/readable` pair).

If the stream is locked, this method throws error. However you can do [getReaderWhenReady()](generated-doc/class.RdStream/README.md#-getreaderwhenreadyoptions-mode-byob-promisereadablestreambyobreader--omitreader-read), and call identical method on the reader.

> ⚙ RdStream.[uint8Array](generated-doc/class.RdStream/README.md#-uint8arrayoptions-lengthlimit-number-promiseuint8arrayarraybufferlike)(options?: \{lengthLimit?: `number`}): Promise\<Uint8Array\<ArrayBufferLike>>

Reads the whole stream to memory.

If `lengthLimit` is specified (and is positive number), and the stream happens to be bigger than this number, a [TooBigError](generated-doc/class.TooBigError/README.md) exception is thrown.

If the stream is locked, this method throws error. However you can do [getReaderWhenReady()](generated-doc/class.RdStream/README.md#-getreaderwhenreadyoptions-mode-byob-promisereadablestreambyobreader--omitreader-read), and call identical method on the reader.

> ⚙ RdStream.[text](generated-doc/class.RdStream/README.md#-textlabel-string-options-textdecoderoptions--lengthlimit-number-promisestring)(label?: `string`, options?: TextDecoderOptions \& \{lengthLimit?: `number`}): Promise\<`string`>

Reads the whole stream to memory, and converts it to string, just as `TextDecoder.decode()` does.

If `lengthLimit` is specified (and is positive number), and the stream happens to be bigger than this number, a [TooBigError](generated-doc/class.TooBigError/README.md) exception is thrown.

If the stream is locked, this method throws error. However you can do [getReaderWhenReady()](generated-doc/class.RdStream/README.md#-getreaderwhenreadyoptions-mode-byob-promisereadablestreambyobreader--omitreader-read), and call identical method on the reader.

#### Static methods:

> ⚙ `static` `override` RdStream.[from](generated-doc/class.RdStream/README.md#-static-override-fromrsource-asynciterabler--iterabler--promiseliker-readablestreamr--rdstream)\<R>(source: AsyncIterable\<R> | Iterable\<R | PromiseLike\<R>>): ReadableStream\<R> \& RdStream

Constructs [RdStream](generated-doc/class.RdStream/README.md) from an iterable of `Uint8Array`.
Note that `ReadableStream<Uint8Array>` is also iterable of `Uint8Array`, so it can be converted to [RdStream](generated-doc/class.RdStream/README.md),
and the resulting [RdStream](generated-doc/class.RdStream/README.md) will be a wrapper on it.

If you have data source that implements both `ReadableStream<Uint8Array>` and `Deno.Reader`, it's more efficient to create wrapper from `Deno.Reader`
by calling the [RdStream](generated-doc/class.RdStream/README.md) constructor.

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

This class extends [WritableStream](https://developer.mozilla.org/en-US/docs/Web/API/WritableStream)`<Uint8Array>`.

#### Example

```ts
import {WrStream} from 'https://deno.land/x/water@v1.0.27/mod.ts';

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

> 🔧 WrStream.[constructor](generated-doc/class.WrStream/README.md#-constructorsink-sink)(sink: [Sink](generated-doc/type.Sink/README.md))

> `type` Sink =<br>
> {<br>
> &nbsp; &nbsp; ⚙ [start](generated-doc/type.Sink/README.md#-start-void--promiselikevoid)?(): `void` | PromiseLike\<`void`><br>
> &nbsp; &nbsp; ⚙ [write](generated-doc/type.Sink/README.md#-writechunk-uint8array-number--promiselikenumber)(chunk: Uint8Array): `number` | PromiseLike\<`number`><br>
> &nbsp; &nbsp; ⚙ [flush](generated-doc/type.Sink/README.md#-flush-void--promiselikevoid)?(): `void` | PromiseLike\<`void`><br>
> &nbsp; &nbsp; ⚙ [close](generated-doc/type.Sink/README.md#-close-void--promiselikevoid)?(): `void` | PromiseLike\<`void`><br>
> &nbsp; &nbsp; ⚙ [abort](generated-doc/type.Sink/README.md#-abortreason-unknown-void--promiselikevoid)?(reason: `unknown`): `void` | PromiseLike\<`void`><br>
> &nbsp; &nbsp; ⚙ [catch](generated-doc/type.Sink/README.md#-catchreason-unknown-void--promiselikevoid)?(reason: `unknown`): `void` | PromiseLike\<`void`><br>
> &nbsp; &nbsp; ⚙ [finally](generated-doc/type.Sink/README.md#-finally-void--promiselikevoid)?(): `void` | PromiseLike\<`void`><br>
> }

In the Sink [write()](generated-doc/type.Sink/README.md#-writechunk-uint8array-number--promiselikenumber) is a mandatory method.
It can return result asynchronously (`Promise` object) or synchronously (number result).

#### Properties:

> 📄 `override` `get` WrStreamInternal.[locked](generated-doc/class.WrStreamInternal/README.md#-override-get-locked-boolean)(): `boolean`

When somebody wants to start writing to this stream, he calls [WrStream.getWriter()](generated-doc/class.WrStreamInternal/README.md#-override-getwriter-writablestreamdefaultwriteruint8arrayarraybufferlike--writer), and after that call the stream becomes locked.
Future calls to [WrStream.getWriter()](generated-doc/class.WrStreamInternal/README.md#-override-getwriter-writablestreamdefaultwriteruint8arrayarraybufferlike--writer) will throw error till the writer is released ([Writer.releaseLock()](generated-doc/class.ReaderOrWriter/README.md#-releaselock-void)).

Other operations that write to the stream (like [WrStream.write()](generated-doc/class.WrStreamInternal/README.md#-writechunk-uint8array--string-promisevoid)) also lock it (internally they get writer, and release it later).

> 📄 `get` WrStreamInternal.[isClosed](generated-doc/class.WrStreamInternal/README.md#-get-isclosed-boolean)(): `boolean`

Becomes true after [close()](generated-doc/class.WrStreamInternal/README.md#-override-close-promisevoid) or [abort()](generated-doc/class.WrStreamInternal/README.md#-override-abortreason-unknown-promisevoid) was called.

#### Methods:

> ⚙ `override` WrStreamInternal.[getWriter](generated-doc/class.WrStreamInternal/README.md#-override-getwriter-writablestreamdefaultwriteruint8arrayarraybufferlike--writer)(): WritableStreamDefaultWriter\<Uint8Array\<ArrayBufferLike>> \& Writer

Returns object that allows to write data to the stream.
The stream becomes locked till this writer is released by calling [Writer.releaseLock()](generated-doc/class.ReaderOrWriter/README.md#-releaselock-void) or [Symbol.dispose()](generated-doc/class.ReaderOrWriter/README.md#-symboldispose-void).

If the stream is already locked, this method throws error.

> ⚙ WrStreamInternal.[getWriterWhenReady](generated-doc/class.WrStreamInternal/README.md#-getwriterwhenready-promisewritablestreamdefaultwriteruint8arrayarraybufferlike--writer)(): Promise\<WritableStreamDefaultWriter\<Uint8Array\<ArrayBufferLike>> \& Writer>

Like [WrStream.getWriter()](generated-doc/class.WrStreamInternal/README.md#-override-getwriter-writablestreamdefaultwriteruint8arrayarraybufferlike--writer), but waits for the stream to become unlocked before returning the writer (and so locking it again).

> ⚙ `override` WrStreamInternal.[abort](generated-doc/class.WrStreamInternal/README.md#-override-abortreason-unknown-promisevoid)(reason?: `unknown`): Promise\<`void`>

Interrupt current writing operation (reject the promise that [Writer.write()](generated-doc/class.Writer/README.md#-writechunk-uint8array--string-promisevoid) returned, if any),
and set the stream to error state.
This leads to calling [Sink.abort(reason)](generated-doc/type.Sink/README.md#-abortreason-unknown-void--promiselikevoid), even if current [Sink.write()](generated-doc/type.Sink/README.md#-writechunk-uint8array-number--promiselikenumber) didn't finish.
[Sink.abort()](generated-doc/type.Sink/README.md#-abortreason-unknown-void--promiselikevoid) is expected to interrupt or complete all the current operations,
and finalize the sink, as no more callbacks will be called.

In contrast to `WritableStream.abort()`, this method works even if the stream is locked.

> ⚙ `override` WrStreamInternal.[close](generated-doc/class.WrStreamInternal/README.md#-override-close-promisevoid)(): Promise\<`void`>

Calls [Sink.close()](generated-doc/type.Sink/README.md#-close-void--promiselikevoid). After that no more callbacks will be called.
If [Sink.close()](generated-doc/type.Sink/README.md#-close-void--promiselikevoid) called again on already closed stream, nothing happens (no error is thrown).

> ⚙ WrStreamInternal.[write](generated-doc/class.WrStreamInternal/README.md#-writechunk-uint8array--string-promisevoid)(chunk?: Uint8Array | `string`): Promise\<`void`>

Waits for the stream to be unlocked, gets writer (locks the stream),
writes the chunk, and then releases the writer (unlocks the stream).
This is the same as doing:

```ts
{	using writer = await wrStream.getWriterWhenReady();
	await writer.write(chunk);
}
```

> ⚙ WrStreamInternal.[flush](generated-doc/class.WrStreamInternal/README.md#-flush-promisevoid)(): Promise\<`void`>

Waits for the stream to be unlocked, gets writer (locks the stream),
flushes the stream, and then releases the writer (unlocks the stream).
This is the same as doing:

```ts
{	using writer = await wrStream.getWriterWhenReady();
	await writer.flush();
}
```

### class TrStream

This class extends [TransformStream](https://developer.mozilla.org/en-US/docs/Web/API/TransformStream)`<Uint8Array, Uint8Array>`.

#### Examples

The following example demonstrates [TrStream](generated-doc/class.TrStream/README.md) that encloses the input in `"`-quotes, and inserts `\` chars before each `"` or `\` in the input,
and converts ASCII CR and LF to `\r` and `\n` respectively.

```ts
import {RdStream, TrStream} from 'https://deno.land/x/water@v1.0.27/mod.ts';

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
import {RdStream, WrStream, TrStream} from 'https://deno.land/x/water@v1.0.27/mod.ts';

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

> 🔧 TrStream.[constructor](generated-doc/class.TrStream/README.md#-constructortransformer-transformer)(transformer: [Transformer](generated-doc/type.Transformer/README.md))

> `type` Transformer =<br>
> {<br>
> &nbsp; &nbsp; ⚙ [start](generated-doc/type.Transformer/README.md#-startwriter-writer-void--promiselikevoid)?(writer: [Writer](generated-doc/class.Writer/README.md)): `void` | PromiseLike\<`void`><br>
> &nbsp; &nbsp; ⚙ [transform](generated-doc/type.Transformer/README.md#-transformwriter-writer-chunk-uint8array-canreturnzero-boolean-number--promiselikenumber)(writer: [Writer](generated-doc/class.Writer/README.md), chunk: Uint8Array, canReturnZero: `boolean`): `number` | PromiseLike\<`number`><br>
> &nbsp; &nbsp; ⚙ [flush](generated-doc/type.Transformer/README.md#-flushwriter-writer-void--promiselikevoid)?(writer: [Writer](generated-doc/class.Writer/README.md)): `void` | PromiseLike\<`void`><br>
> }

#### Properties:

> 📄 `override` `readonly` TrStream.[writable](generated-doc/class.TrStream/README.md#-override-readonly-writable-wrstream): [WrStream](generated-doc/class.WrStream/README.md)

Input for the original stream.
All the bytes written here will be transformed by this object, and will be available for reading from [TrStream.readable](generated-doc/class.TrStream/README.md#-override-readonly-readable-rdstream).

> 📄 `override` `readonly` TrStream.[readable](generated-doc/class.TrStream/README.md#-override-readonly-readable-rdstream): [RdStream](generated-doc/class.RdStream/README.md)

Outputs the transformed stream.