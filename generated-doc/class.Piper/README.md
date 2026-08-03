# `class` Piper

[Documentation Index](../README.md)

## This class has

- [constructor](#-constructorbuffer-uint8arrayarraybuffer-autoallocatemin-number)
- 6 methods:
[pipeTo](#-pipetowriterclosedpromise-promisevoid-callbacksforread-callbacks-callbackwriteinverting-chunk-uint8array-canreturnzero-boolean--number--promiselikenumber-promiseboolean),
[settleRead](#-settleread-promiseboolean),
[read](#-readview-uint8array-uint8arrayarraybufferlike),
[unread](#-unreadchunk-uint8array-void),
[unwrap](#-unwrap-uint8arrayarraybuffer),
[dispose](#-dispose-uint8arrayarraybuffer)


#### 🔧 `constructor`(buffer: Uint8Array\<ArrayBuffer>, autoAllocateMin: `number`)



#### ⚙ pipeTo(writerClosedPromise: Promise\<`void`>, callbacksForRead: [Callbacks](../type.Callbacks/README.md), callbackWriteInverting: (chunk: Uint8Array, canReturnZero: `boolean`) => `number` | PromiseLike\<`number`>): Promise\<`boolean`>



#### ⚙ settleRead(): Promise\<`boolean`>

> If an interrupted `pipeTo()` left a read operation pending, await it, and record the data
> it loaded to the buffer, so the buffered data can be consumed with `read()` or `unwrap()`,
> and a new read can be safely started.
> Returns true if the source reached EOF.



#### ⚙ read(view: Uint8Array): Uint8Array\<ArrayBufferLike>



#### ⚙ unread(chunk: Uint8Array): `void`



#### ⚙ unwrap(): Uint8Array\<ArrayBuffer>



#### ⚙ dispose(): Uint8Array\<ArrayBuffer>



