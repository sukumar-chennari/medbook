import { Schema, model } from 'mongoose';

// One document per refresh token we have handed out.
// We store only a HASH of the token, like a password: if the database leaks,
// the stored values cannot be used to log in.
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    // All tokens that descend from one login share a "family" id. If an old (already used)
    // token ever shows up again, we cancel the whole family. Used by the refresh step.
    family: { type: String, required: true, index: true },
    // MongoDB deletes the document by itself once this time passes (a "TTL index"),
    // so expired tokens never pile up.
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    // Set when the token is used up (rotation) or the user logs out.
    revokedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const RefreshToken = model('RefreshToken', refreshTokenSchema);
