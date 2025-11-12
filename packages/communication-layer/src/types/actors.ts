import { z } from 'zod';

/**
 * Actor Types in the Platform AI System
 *
 * Defines who can perform which actions within the system.
 */

/**
 * User: Can query navigators
 */
export const UserActorSchema = z.object({
  type: z.literal('user'),
  id: z.string(),
  name: z.string().optional(),
});

/**
 * Operator: Can query + configure + curate knowledge
 */
export const OperatorActorSchema = z.object({
  type: z.literal('operator'),
  id: z.string(),
  name: z.string().optional(),
  permissions: z.array(z.enum(['query', 'configure', 'curate'])).default(['query', 'configure', 'curate']),
});

/**
 * Agent: Can communicate with other agents
 */
export const AgentActorSchema = z.object({
  type: z.literal('agent'),
  id: z.string(),
  navigatorName: z.string(),
  domain: z.string().optional(),
});

/**
 * Union type for all actors
 */
export const ActorSchema = z.discriminatedUnion('type', [
  UserActorSchema,
  OperatorActorSchema,
  AgentActorSchema,
]);

/**
 * TypeScript types inferred from Zod schemas
 */
export type UserActor = z.infer<typeof UserActorSchema>;
export type OperatorActor = z.infer<typeof OperatorActorSchema>;
export type AgentActor = z.infer<typeof AgentActorSchema>;
export type Actor = z.infer<typeof ActorSchema>;

/**
 * Capability checks for actors
 */
export const ActorCapabilities = {
  canQuery: (_actor: Actor): boolean => {
    return true; // All actors can query
  },

  canConfigure: (actor: Actor): boolean => {
    return actor.type === 'operator';
  },

  canCurate: (actor: Actor): boolean => {
    return actor.type === 'operator';
  },

  canCommunicateWithAgents: (actor: Actor): boolean => {
    return actor.type === 'agent';
  },
} as const;
