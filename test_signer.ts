import forge from 'https://esm.sh/node-forge@1.3.1'

const pfxBase64 = "MIIBpgIBAzCCAXAGCSqGSIb3DQEHAaCCAWEEggFdMIIBWTCCAVUGCSqGSIb3DQEHBqCCAUYwggFCAgEAMIIBPAYJKoZIhvcNAQcBMBwGCiqGSIb3DQEMAQYwDgQIPp6g1P8Xl54CAggAgIIBIEA5S12X7N6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8J6F9R9S7/9n8M8V2N3X9K8="; // Not valid but for length test

const pfxBytes = forge.util.decode64(pfxBase64);
const binaryStringToUint8Array = (binary: string) =>
  Uint8Array.from(binary, (char) => char.charCodeAt(0))

const pfxByteArray1 = binaryStringToUint8Array(pfxBytes);
console.log('pfxBytes length:', pfxBytes.length);
console.log('pfxByteArray1 length:', pfxByteArray1.length);
console.log('pfxByteArray1[0]:', pfxByteArray1[0]);

const pfxByteArray2 = new Uint8Array(forge.util.binary.raw.decode(pfxBytes));
console.log('pfxByteArray2 length:', pfxByteArray2.length);
console.log('pfxByteArray2[0]:', pfxByteArray2[0]);

const pfxByteArray3 = forge.util.binary.raw.decode(pfxBytes);
console.log('pfxByteArray3 type:', typeof pfxByteArray3);
console.log('pfxByteArray3 instanceof Uint8Array:', pfxByteArray3 instanceof Uint8Array);

