# `class` ReadCallbackAccessor `extends` [CallbackAccessor](../class.CallbackAccessor/README.md)

[Documentation Index](../README.md)

## This class has

- [constructor](#-constructorautoallocatechunksize-number-autoallocatemin-number-callbacks-callbacks)
- 3 properties:
[curPiper](#-curpiper-piper--undefined),
[autoAllocateChunkSize](#-autoallocatechunksize-number),
[autoAllocateMin](#-autoallocatemin-number)
- 3 methods:
[read](#-readview-uint8array-min-number0-promiseuint8arrayarraybufferlike),
[getOrCreatePiper](#-getorcreatepiper-piper),
[dropPiper](#-droppipercurpiper-piper-void)
- 10 inherited members from [CallbackAccessor](../class.CallbackAccessor/README.md)


#### 🔧 `constructor`(autoAllocateChunkSize: `number`, autoAllocateMin: `number`, callbacks: [Callbacks](../type.Callbacks/README.md))



#### 📄 curPiper: [Piper](../class.Piper/README.md) | `undefined`



#### 📄 autoAllocateChunkSize: `number`



#### 📄 autoAllocateMin: `number`



#### ⚙ read(view?: Uint8Array, min: `number`=0): Promise\<Uint8Array\<ArrayBufferLike>>



#### ⚙ getOrCreatePiper(): [Piper](../class.Piper/README.md)



#### ⚙ dropPiper(curPiper: [Piper](../class.Piper/README.md)): `void`



