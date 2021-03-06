import React from 'react';
import { ReactElement, useState, useEffect } from 'react';
import './App.css';
import { pubkey } from './id_rsa.pub';
import { validExample, invalidExample } from './example';
import * as openpgp from 'openpgp';

const GITHUB_URL = "https://github.com/1F35C/signature-verifier";
const FULL_REGEX = /-----BEGIN PGP SIGNED MESSAGE-----.*-----BEGIN PGP SIGNATURE-----\s*[A-Za-z0-9+/=]+\s*-----END PGP SIGNATURE-----/;
const BEGIN_PGP_SIGNATURE = "-----BEGIN PGP SIGNATURE-----";
const END_PGP_SIGNATURE = "-----END PGP SIGNATURE-----";

const MISFORMED_ARMOR_ERROR = "Unexpected Message Format"

function getGithubFileURL(filepath: string): string {
  return GITHUB_URL + '/blob/main/' + filepath;
};

type VerifyResult = {
  verified: boolean;
  keyCreationTime: number;
  messageSignedTime: number;
};

function verifyArmorText(armored: string): boolean {
  const armoredSingleLine = armored.replace(/[\n\r]+/g, "");
  if (!FULL_REGEX.test(armoredSingleLine)) {
    return false;
  }
  const beginIdx = armoredSingleLine.indexOf(BEGIN_PGP_SIGNATURE) + BEGIN_PGP_SIGNATURE.length;
  const endIdx = armoredSingleLine.indexOf(END_PGP_SIGNATURE);
  return (endIdx - beginIdx) === 761;
}

async function checkKey(message: string, publicKeyString: string) : Promise<VerifyResult> {
  if (!message || message.length === 0) {
    throw new Error("Message is empty");
  }
  
  // There is a bug in openpgp.js where invalid armor message can throw an error that cannot be
  // caught, due to an uncaught error inside a promise. So we will verify manually.
  if (!verifyArmorText(message)) {
    throw new Error(MISFORMED_ARMOR_ERROR);
  }

  let signedMessageAsync = await openpgp.readCleartextMessage({ cleartextMessage: message });
  let publicKeyAsync = openpgp.readKey({ armoredKey: publicKeyString });
  let [signedMessage, publicKey] = await Promise.all([signedMessageAsync, publicKeyAsync]);
  let keyCreationTime = publicKey.keyPacket.created.valueOf();
  let verifyOptions: any = {
      message: signedMessage,
      verificationKeys: publicKey,
      expectSigned: true
  };
  let result = await openpgp.verify(verifyOptions);
  let [verified, signature] = await Promise.all([result.signatures[0].verified, result.signatures[0].signature]);

  var messageSignedTime = 0;
  if (signature.packets.length > 0) {
    let packet = signature.packets[0];
    if (packet.created) {
      messageSignedTime = packet.created.valueOf();
    }
  }

  return {
    verified: verified,
    keyCreationTime: keyCreationTime,
    messageSignedTime: messageSignedTime
  };
}

enum PGPState {
  Hidden,
  Loading,
  Verified,
  Failed
};

type PGPResult = {
  state: PGPState;
  messageSignedTime: number;
  keyCreationTime: number;
  error: string | null;
};

const AboutBox = (): JSX.Element => {
  return (
    <div className="box">
      <h2>What?</h2>
      <p>
        This is a webpage where you can check whether a message was written by the owner of this repository.
      </p>
      <h2>Why?</h2>
      <p>
        This page could be useful if I wanted to take credit for this GitHub user in real life without compromising anonymity on the web.
        For example, I could send a potential customer/employer a signed message that they can verify on this page to verify my authorship.
      </p>
      <p>
        Conversely, no one else will not be able to take credit for this GitHub user account either. (I would first need more work on this account to make that worth doing :P)
      </p>
      <h2>How?</h2>
      <p>
        This project uses <a href="https://en.wikipedia.org/wiki/RSA_(cryptosystem)">RSA asymmetric cryptography</a> to verify the source of signed messages.
      </p>
      <p>
        First a private/public key pair is generated using RSA.
        The private key can be used to sign a message, and the public key can be used to verify the message.
      </p>
      <p>
        The private key should be safeguarded, only accessible to the person signing messages.
        The public key can be sent out to anyone who wants to verify the message, as the public key cannot be used to sign messages.
        In this case, the public key is embedded to the webpage for easy signature verification.
      </p>
      <ul>
        <li><a href={ getGithubFileURL('generateKeys.js') }>generateKeys.js</a> is used to generate the private/public key pair, storing the private key in a gitignored directory, and updating JS to use the new public key.</li>
        <li><a href={ getGithubFileURL('generateProof.js') }>generateProof.js</a> is used to generate a message that is signed with a private key.</li>
      </ul>
      For more information, here's the <a href={ GITHUB_URL }>repository</a>!
      <h2>Attributions</h2>
      <ul>
        <li><a href="https://openpgpjs.org/">openpgp.js</a> for RSA implementation (key generation/signing/signature verification)</li>
        <li><a href="https://www.svgrepo.com/collection/essential-collection/1">svgrepo.com</a> for icons</li>
      </ul>
    </div>
  );
}

const Loading = (): JSX.Element => {
  return (
    <div className="box-section centered loading">
      <img className="icon" src="stopwatch.svg" alt=""/>
      <br />
      <span className="status">
        Verifying...
      </span>
    </div>
  );
};

const Verified = (params: { keyCreationTime: number, messageSignedTime: number }): JSX.Element => {
  return (
    <div className="box-section centered loading">
      <img className="icon" src="success.svg" alt=""/>
      <br />
      <span className="status">
        Verified
      </span>
      <br />
      <span className="detail">
        Signed on { new Date(params.messageSignedTime).toLocaleString() }
        <br />
        Public key created on { new Date(params.keyCreationTime).toLocaleString() }
      </span>
    </div>
  );
}

const Failed = (params: { error: string }): JSX.Element => {
  return (
    <div className="box-section centered loading">
      <img className="icon" src="error.svg" alt=""/>
      <br />
      <span className="status">
        Verification Failed
      </span>
      <br />
      <span className="detail">
        {params.error }
      </span>
    </div>
  );
}

function getResultView(result: PGPResult): JSX.Element {
  switch (result.state) {
    case PGPState.Hidden:
      return (<div className="hidden" />);
    case PGPState.Loading:
      return Loading();
    case PGPState.Verified:
      return Verified({ messageSignedTime: result.messageSignedTime ?? 0,
                        keyCreationTime: result.keyCreationTime ?? 0 });
    case PGPState.Failed:
      return Failed({ error: result.error ?? "unknown" });
    default:
      throw new Error('Invalid result value');
  }
}

function App(): ReactElement {
  let [message, setMessage] = useState<string>("");
  let [result, setResult] = useState<PGPResult>({ state: PGPState.Hidden, keyCreationTime: 0, messageSignedTime: 0, error: null});

  useEffect(() => {
    if (message === "") {
      setResult({ state: PGPState.Hidden, keyCreationTime: 0, messageSignedTime: 0, error: null });
    } else {
      setResult({ state: PGPState.Loading, keyCreationTime: 0, messageSignedTime: 0, error: null });
      checkKey(message, pubkey)
          .then((result) => {
            let state = result.verified ? PGPState.Verified : PGPState.Failed;
            setResult({ state: state, keyCreationTime: result.keyCreationTime, messageSignedTime: result.messageSignedTime, error: null });
          })
          .catch((err) => {
            setResult({ state: PGPState.Failed, keyCreationTime: 0, messageSignedTime: 0, error: err.message });
          });
    }
  }, [message]);

  return (
    <div className="App">
      <div className="box">
				<div className="box-section">
					<h1>Signature Verifier</h1>
				</div>
				<div className="box-section">
					Please paste your signed signature below:
					<textarea className="signature-field" onChange={ (evt) => { setMessage(evt.target.value); } } autoFocus={ true } value={ message } />
          <button onClick={ () => { setMessage(validExample); } }>Valid Example</button>
          <button onClick={ () => { setMessage(invalidExample); } }>Invalid Example</button>
          <button onClick={ () => { setMessage(""); } }>Clear</button>
				</div>
				{getResultView(result)}
			</div>
      <AboutBox />
    </div>
  );
}


export default App;
