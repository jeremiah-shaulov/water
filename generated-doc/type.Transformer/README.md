# `type` Transformer

[Documentation Index](../README.md)

```ts
import {Transformer} from "https://deno.land/x/water@v1.0.27/mod.ts"
```

## This type has

- 3 methods:
[start](#-startwriter-writer-void--promiselikevoid),
[transform](#-transformwriter-writer-chunk-uint8array-canreturnzero-boolean-number--promiselikenumber),
[flush](#-flushwriter-writer-void--promiselikevoid)


#### ⚙ start?(writer: [Writer](../class.Writer/README.md)): `void` | PromiseLike\<`void`>

> This callback is called immediately during `TrStream` object creation.
> When it's promise resolves, i start to call `transform()` to transform data chunks.
> Only one call is active at each moment, and next calls wait for previous calls to complete.
> 
> When the whole input stream is converted without an error, `flush()` is called, as the last action.
> If `start()` or `transform()` throw error, this error is propagated to the output stream,
> and no more callbacks are called.



#### ⚙ transform(writer: [Writer](../class.Writer/README.md), chunk: Uint8Array, canReturnZero: `boolean`): `number` | PromiseLike\<`number`>

> During stream transformation this callback gets called for chunks (pieces) of incoming data.
> This callback is expected to transform the data as needed, and to write the result to a `writer`
> provided to it.
> Each input chunk can be of any non-zero size.
> If this callback cannot decide how to transform current chunk, and `canReturnZero` is true,
> it can return 0, and then this callback will be called again with a larger chunk,
> or the caller will discover that this was the last chunk, and next time will call
> `transform()` with the same chunk and `!canReturnZero`.
> In order to provide a larger chunk, the caller of this callback may be required to reallocate (grow) it's internal buffer.



#### ⚙ flush?(writer: [Writer](../class.Writer/README.md)): `void` | PromiseLike\<`void`>

> At last, when the whole stream was transformed, this callback is called.



