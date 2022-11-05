import { AuthenticatorDevice } from '@simplewebauthn/typescript-types';
import { convertMongoDbBinaryToBuffer, database } from './index';

export interface AuthenticatorDeviceDetails extends AuthenticatorDevice {
  name?: string;
  lastUsed?: number;
  clientExtensionResults?: AuthenticationExtensionsClientOutputs;
}

export interface User {
  /**
   * 2FA and Passwordless WebAuthn flows expect you to be able to uniquely identify the user that
   * performs registration or authentication. The user ID you specify here should be your internal,
   * _unique_ ID for that user (uuid, etc...). Avoid using identifying information here, like email
   * addresses, as it may be stored within the authenticator.
   */
  id: string;
  /**
   * The username can be a human-readable name, email, etc... as it is intended only for display.
   */
  email: string;
  devices: AuthenticatorDeviceDetails[];
  challenge: {
    validUntil: number;
    data: string;
  };
}

const users = database.collection<User>('users');

export const create = async (user: User) => {
  // Specifying a Schema is optional, but it enables type hints on
  // finds and inserts
  await users.createIndex({ id: 1, email: 2 }, { unique: true });

  const result = await users.insertOne(user);
  console.log(`A document was inserted with the _id: ${result.insertedId}`);
  return result;
};

type EmailOrId = Partial<Pick<User, 'id' | 'email'>>;

const byIdOrEmail = ({ id, email }: EmailOrId) => ({
  ...(id ? { id } : {}),
  ...(email ? { email } : {}),
});

export const doesUserExist = async (user: EmailOrId) => (await users.findOne(byIdOrEmail(user))) !== null;

const convertUser = (user: User | null): User => {
  if (!user) {
    throw new Error('User not found');
  }

  return {
    ...user,
    devices: user.devices.map((device) => ({
      ...device,
      credentialPublicKey: convertMongoDbBinaryToBuffer(device.credentialPublicKey),
      credentialID: convertMongoDbBinaryToBuffer(device.credentialID),
    })),
  };
};

export const get = async (user: EmailOrId) => convertUser(await users.findOne(byIdOrEmail(user)));

export const getForChallenge = async (user: EmailOrId) =>
  convertUser(await users.findOne({ ...byIdOrEmail(user), 'challenge.validUntil': { $gt: Date.now() } }));

export const replace = async (user: EmailOrId, update: User) => users.findOneAndReplace(byIdOrEmail(user), update);

export const updateDevice = async (user: EmailOrId, device: AuthenticatorDevice) =>
  users.findOneAndUpdate(
    { ...byIdOrEmail(user), 'devices.credentialID': device.credentialID },
    {
      $set: {
        'devices.$': device,
      },
    }
  );

export const remove = async (user: EmailOrId) => users.findOneAndDelete(byIdOrEmail(user));
