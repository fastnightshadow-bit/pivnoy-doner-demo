const TRANSITIONS = Object.freeze({
  submitted: Object.freeze(['accepted', 'cancelled']),
  accepted: Object.freeze(['cooking', 'cancelled']),
  cooking: Object.freeze(['ready', 'cancelled']),
  ready: Object.freeze(['courier', 'completed', 'cancelled']),
  courier: Object.freeze(['delivered', 'cancelled']),
  delivered: Object.freeze(['completed']),
  completed: Object.freeze([]),
  cancelled: Object.freeze([]),
});

const ROLE_TRANSITIONS = Object.freeze({
  kitchen: Object.freeze([
    'submitted:accepted',
    'submitted:cancelled',
    'accepted:cooking',
    'accepted:cancelled',
    'cooking:ready',
    'cooking:cancelled',
    'ready:completed',
    'ready:cancelled',
  ]),
  courier: Object.freeze(['ready:courier', 'courier:delivered']),
});

export const canTransition = (from, to, role) => {
  if (!TRANSITIONS[from]?.includes(to)) return false;
  if (role === 'owner') return true;
  return ROLE_TRANSITIONS[role]?.includes(`${from}:${to}`) ?? false;
};

export const getAllowedTransitions = (status, role) =>
  (TRANSITIONS[status] ?? []).filter((next) =>
    canTransition(status, next, role),
  );
