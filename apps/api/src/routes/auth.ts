import { Router } from 'express';
import { registerSchema } from '../schemas/auth';
import { registerUser } from '../services/auth.service';

export const authRouter = Router();

// POST /auth/register
authRouter.post('/register', async (req, res) => {
  // parse() throws if the input is invalid. The central error handler turns that into a 400.
  const input = registerSchema.parse(req.body);
  const user = await registerUser(input);
  res.status(201).json({ user });
});
