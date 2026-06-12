import forge from 'https://esm.sh/node-forge@1.3.1'
import { P12Signer } from 'https://esm.sh/@libpdf/core@0.3.6'

const binaryStringToUint8Array = (binary: string) =>
  Uint8Array.from(binary, (char) => char.charCodeAt(0))

// Create a dummy PKCS#12 for testing
const pki = forge.pki;
const keys = pki.rsa.generateKeyPair(2048);
const cert = pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
cert.setSubject([{ name: 'commonName', value: 'Test' }]);
cert.setIssuer([{ name: 'commonName', value: 'Test' }]);
cert.sign(keys.privateKey);

const password = 'password';
const p12Der = forge.pkcs12.toPkcs12Der(keys.privateKey, cert, password);
const p12Bytes = p12Der.getBytes();

console.log('Test 1: Uint8Array from binary string (legacy approach)');
const pfxByteArray1 = binaryStringToUint8Array(p12Bytes);
try {
    await P12Signer.create(pfxByteArray1, password);
    console.log('Success 1');
} catch (e) {
    console.log('Failed 1:', e.message);
}

console.log('Test 2: Uint8Array from binary string (forge util approach)');
const pfxByteArray2 = new Uint8Array(forge.util.binary.raw.decode(p12Bytes));
try {
    await P12Signer.create(pfxByteArray2, password);
    console.log('Success 2');
} catch (e) {
    console.log('Failed 2:', e.message);
}

console.log('Test 3: Buffer approach (if available)');
const pfxByteArray3 = new Uint8Array(p12Bytes.split('').map(c => c.charCodeAt(0)));
try {
    await P12Signer.create(pfxByteArray3, password);
    console.log('Success 3');
} catch (e) {
    console.log('Failed 3:', e.message);
}

