-- Add new bot flow states to the conversation_state enum
ALTER TYPE conversation_state ADD VALUE IF NOT EXISTS 'SELECTING_DATE_SESSION';
ALTER TYPE conversation_state ADD VALUE IF NOT EXISTS 'SELECTING_SERVICE_GROUPS';
ALTER TYPE conversation_state ADD VALUE IF NOT EXISTS 'SELECTING_SUBSERVICES';

-- Reset any stale conversations stuck in the old states so they restart cleanly
UPDATE public.conversation_states
SET state = 'IDLE', context = '{}', updated_at = NOW()
WHERE state IN ('SELECTING_DATE', 'SELECTING_SESSION', 'SELECTING_SERVICES');
