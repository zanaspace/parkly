import { registerOTel } from '@vercel/otel';

registerOTel({ serviceName: 'parkly-api' });
