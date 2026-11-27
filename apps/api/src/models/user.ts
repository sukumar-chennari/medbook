import { Schema, model } from 'mongoose';

export const USER_ROLES = ['patient', 'doctor', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // unique: true creates a database index, so two users can never share an email,
    // even if two register requests arrive at the same moment.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select: false means normal queries do NOT return the hash.
    // Only login asks for it explicitly: User.findOne(...).select('+passwordHash')
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, required: true, default: 'patient' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const User = model('User', userSchema);
