import { z } from 'zod';

// What a client is allowed to send when registering.
// There is deliberately NO "role" here. Zod drops any field not listed, so a client
// sending { "role": "admin" } is ignored and cannot make itself an admin.
export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email')),
  // Minimum length protects users. The maximum stops someone sending a 10 MB "password"
  // to make the server waste time hashing it.
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
