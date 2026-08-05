import { createPreparationEta } from './preparation-time.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

export const createDemoEmployees = () =>
  clone([
    {
      id: 'employee-anton',
      name: 'Антон',
      pin: '2468',
      shift: '10:00–22:00',
    },
    {
      id: 'employee-maria',
      name: 'Мария',
      pin: '1357',
      shift: '10:00–22:00',
    },
  ]);

export const createDemoOrders = (referenceMs = Date.now()) => {
  const at = (offsetMinutes) =>
    new Date(referenceMs + offsetMinutes * 60000).toISOString();

  const orders = [
    {
      id: 'order-0464',
      number: '0464',
      status: 'new',
      paymentStatus: 'succeeded',
      fulfillment: 'pickup',
      createdAt: at(-6),
      promisedAt: at(14),
      customer: { name: 'Алексей', phone: '+7 (900) 000-00-00' },
      items: [
        {
          id: 'classic-chicken',
          name: 'Классическая шаурма',
          quantity: 2,
          options: ['Курица', 'Стандарт', 'Сыр'],
          sauce: 'Тейсти',
          comment: 'Без лука',
        },
      ],
      comment: 'Упаковать отдельно',
      total: 800,
      history: [],
    },
    {
      id: 'order-0465',
      number: '0465',
      status: 'new',
      paymentStatus: 'succeeded',
      fulfillment: 'delivery',
      createdAt: at(-3),
      promisedAt: at(27),
      customer: { name: 'Ольга', phone: '+7 (900) 000-00-01' },
      address: {
        street: 'Тестовая улица, 15',
        entrance: '2',
        floor: '4',
        apartment: '18',
        intercom: '18К',
      },
      items: [
        {
          id: 'doner-beef',
          name: 'Донер',
          quantity: 1,
          options: ['Говядина', 'Большой'],
          comment: '',
        },
        {
          id: 'fries',
          name: 'Картофель фри',
          quantity: 1,
          options: [],
          comment: '',
        },
      ],
      comment: 'Вход со двора',
      total: 650,
      history: [],
    },
    {
      id: 'order-0462',
      number: '0462',
      status: 'accepted',
      paymentStatus: 'succeeded',
      fulfillment: 'pickup',
      createdAt: at(-15),
      promisedAt: at(10),
      acceptedAt: at(-12),
      employee: 'Мария',
      customer: { name: 'Ирина', phone: '+7 (900) 000-00-02' },
      items: [
        {
          id: 'burger-standard',
          name: 'Бургер Стандарт',
          quantity: 2,
          options: [],
          comment: '',
        },
      ],
      total: 700,
      history: [
        {
          from: 'new',
          to: 'accepted',
          employee: 'Мария',
          at: at(-12),
          reason: '',
        },
      ],
    },
    {
      id: 'order-0460',
      number: '0460',
      status: 'cooking',
      paymentStatus: 'succeeded',
      fulfillment: 'delivery',
      createdAt: at(-26),
      promisedAt: at(4),
      acceptedAt: at(-24),
      employee: 'Антон',
      customer: { name: 'Сергей', phone: '+7 (900) 000-00-03' },
      address: {
        street: 'Учебный проезд, 7',
        entrance: '1',
        floor: '3',
        apartment: '12',
        intercom: '12',
      },
      items: [
        {
          id: 'shawarma-beef',
          name: 'Шаурма Барбекю',
          quantity: 1,
          options: ['Говядина', 'Гигант', 'Двойное мясо'],
          comment: 'Без халапеньо',
        },
      ],
      total: 800,
      history: [
        {
          from: 'new',
          to: 'accepted',
          employee: 'Антон',
          at: at(-24),
          reason: '',
        },
        {
          from: 'accepted',
          to: 'cooking',
          employee: 'Антон',
          at: at(-21),
          reason: '',
        },
      ],
    },
    {
      id: 'order-0459',
      number: '0459',
      status: 'ready',
      paymentStatus: 'succeeded',
      fulfillment: 'pickup',
      createdAt: at(-32),
      promisedAt: at(-2),
      acceptedAt: at(-30),
      employee: 'Мария',
      customer: { name: 'Дмитрий', phone: '+7 (900) 000-00-04' },
      items: [
        {
          id: 'hotdog-danish',
          name: 'Хот-дог Датский',
          quantity: 1,
          options: [],
          comment: '',
        },
      ],
      total: 250,
      history: [
        {
          from: 'cooking',
          to: 'ready',
          employee: 'Мария',
          at: at(-13),
          reason: '',
        },
      ],
    },
    {
      id: 'order-0461',
      number: '0461',
      status: 'ready',
      paymentStatus: 'succeeded',
      fulfillment: 'delivery',
      createdAt: at(-21),
      promisedAt: at(9),
      acceptedAt: at(-20),
      employee: 'Антон',
      customer: { name: 'Елена', phone: '+7 (900) 000-00-05' },
      address: { street: 'Примерная улица, 10' },
      items: [
        {
          id: 'cheese-sticks',
          name: 'Сырные палочки',
          quantity: 2,
          options: [],
          comment: '',
        },
      ],
      total: 500,
      history: [
        {
          from: 'cooking',
          to: 'ready',
          employee: 'Антон',
          at: at(-5),
          reason: '',
        },
      ],
    },
  ];

  const activeStatuses = new Set(['new', 'accepted', 'cooking']);
  const queuedItems = [];
  const promisedById = new Map();

  for (const order of [...orders]
    .filter(({ status }) => activeStatuses.has(status))
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))) {
    const eta = createPreparationEta(order.items, queuedItems);
    promisedById.set(order.id, at(eta.min));
    queuedItems.push(...order.items);
  }

  return clone(
    orders.map((order) => ({
      ...order,
      promisedAt: promisedById.get(order.id) || order.promisedAt,
    })),
  );
};
