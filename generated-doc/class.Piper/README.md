# `class` Piper

[Documentation Index](../README.md)

## This class has

- [constructor](#-constructorbuffer-uint8array-autoallocatemin-number)
- 5 methods:
[pipeTo](#-pipetowriterclosedpromise-promisevoid-callbacksforread-callbacks-callbackwriteinverting-chunk-uint8array-canreturnzero-boolean--number--promiselikenumber-promiseboolean),
[read](#-readview-uint8array-uint8arrayarraybufferlike),
[unread](#-unreadchunk-uint8array-void),
[unwrap](#-unwrap-uint8arrayarraybufferlike),
[dispose](#-dispose-uint8arrayarraybufferlike)


#### 🔧 `constructor`(buffer: Uint8Array, autoAllocateMin: `number`)



#### ⚙ pipeTo(writerClosedPromise: Promise\<`void`>, callbacksForRead: [Callbacks](../type.Callbacks/README.md), callbackWriteInverting: (chunk: Uint8Array, canReturnZero: `boolean`) => `number` | PromiseLike\<`number`>): Promise\<`boolean`>



#### ⚙ read(view: Uint8Array): Uint8Array\<ArrayBufferLike>



#### ⚙ unread(chunk: Uint8Array): `void`



#### ⚙ unwrap(): Uint8Array\<ArrayBufferLike>



#### ⚙ dispose(): Uint8Array\<ArrayBufferLike>



