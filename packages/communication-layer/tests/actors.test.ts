import { describe, it, expect } from 'vitest';
import {
  UserActorSchema,
  OperatorActorSchema,
  AgentActorSchema,
  ActorSchema,
  ActorCapabilities,
} from '../src/index.js';

describe('Actor Types', () => {
  describe('UserActorSchema', () => {
    it('should validate valid user', () => {
      const user = {
        type: 'user' as const,
        id: 'user-123',
        name: 'Alice',
      };

      const result = UserActorSchema.safeParse(user);
      expect(result.success).toBe(true);
    });

    it('should accept user without name', () => {
      const user = {
        type: 'user' as const,
        id: 'user-123',
      };

      const result = UserActorSchema.safeParse(user);
      expect(result.success).toBe(true);
    });

    it('should reject invalid type', () => {
      const user = {
        type: 'operator',
        id: 'user-123',
      };

      const result = UserActorSchema.safeParse(user);
      expect(result.success).toBe(false);
    });
  });

  describe('OperatorActorSchema', () => {
    it('should validate valid operator', () => {
      const operator = {
        type: 'operator' as const,
        id: 'op-123',
        name: 'Bob',
      };

      const result = OperatorActorSchema.safeParse(operator);
      expect(result.success).toBe(true);
    });

    it('should use default permissions', () => {
      const operator = {
        type: 'operator' as const,
        id: 'op-123',
      };

      const result = OperatorActorSchema.safeParse(operator);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.permissions).toEqual(['query', 'configure', 'curate']);
      }
    });

    it('should accept custom permissions', () => {
      const operator = {
        type: 'operator' as const,
        id: 'op-123',
        permissions: ['query'] as const,
      };

      const result = OperatorActorSchema.safeParse(operator);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.permissions).toEqual(['query']);
      }
    });
  });

  describe('AgentActorSchema', () => {
    it('should validate valid agent', () => {
      const agent = {
        type: 'agent' as const,
        id: 'agent-123',
        navigatorName: 'terraform-navigator',
        domain: 'terraform',
      };

      const result = AgentActorSchema.safeParse(agent);
      expect(result.success).toBe(true);
    });

    it('should accept agent without domain', () => {
      const agent = {
        type: 'agent' as const,
        id: 'agent-123',
        navigatorName: 'terraform-navigator',
      };

      const result = AgentActorSchema.safeParse(agent);
      expect(result.success).toBe(true);
    });
  });

  describe('ActorSchema (discriminated union)', () => {
    it('should validate user actor', () => {
      const user = {
        type: 'user' as const,
        id: 'user-123',
      };

      const result = ActorSchema.safeParse(user);
      expect(result.success).toBe(true);
    });

    it('should validate operator actor', () => {
      const operator = {
        type: 'operator' as const,
        id: 'op-123',
      };

      const result = ActorSchema.safeParse(operator);
      expect(result.success).toBe(true);
    });

    it('should validate agent actor', () => {
      const agent = {
        type: 'agent' as const,
        id: 'agent-123',
        navigatorName: 'test-nav',
      };

      const result = ActorSchema.safeParse(agent);
      expect(result.success).toBe(true);
    });
  });

  describe('ActorCapabilities', () => {
    describe('canQuery', () => {
      it('should allow all actors to query', () => {
        const user = { type: 'user' as const, id: 'u1' };
        const operator = { type: 'operator' as const, id: 'o1' };
        const agent = { type: 'agent' as const, id: 'a1', navigatorName: 'nav' };

        expect(ActorCapabilities.canQuery(user)).toBe(true);
        expect(ActorCapabilities.canQuery(operator)).toBe(true);
        expect(ActorCapabilities.canQuery(agent)).toBe(true);
      });
    });

    describe('canConfigure', () => {
      it('should only allow operators to configure', () => {
        const user = { type: 'user' as const, id: 'u1' };
        const operator = { type: 'operator' as const, id: 'o1' };
        const agent = { type: 'agent' as const, id: 'a1', navigatorName: 'nav' };

        expect(ActorCapabilities.canConfigure(user)).toBe(false);
        expect(ActorCapabilities.canConfigure(operator)).toBe(true);
        expect(ActorCapabilities.canConfigure(agent)).toBe(false);
      });
    });

    describe('canCurate', () => {
      it('should only allow operators to curate', () => {
        const user = { type: 'user' as const, id: 'u1' };
        const operator = { type: 'operator' as const, id: 'o1' };
        const agent = { type: 'agent' as const, id: 'a1', navigatorName: 'nav' };

        expect(ActorCapabilities.canCurate(user)).toBe(false);
        expect(ActorCapabilities.canCurate(operator)).toBe(true);
        expect(ActorCapabilities.canCurate(agent)).toBe(false);
      });
    });

    describe('canCommunicateWithAgents', () => {
      it('should only allow agents to communicate with other agents', () => {
        const user = { type: 'user' as const, id: 'u1' };
        const operator = { type: 'operator' as const, id: 'o1' };
        const agent = { type: 'agent' as const, id: 'a1', navigatorName: 'nav' };

        expect(ActorCapabilities.canCommunicateWithAgents(user)).toBe(false);
        expect(ActorCapabilities.canCommunicateWithAgents(operator)).toBe(false);
        expect(ActorCapabilities.canCommunicateWithAgents(agent)).toBe(true);
      });
    });
  });
});
