import base from '@parkly/config/eslint';

export default [...base, { ignores: ['.expo/**', 'expo-env.d.ts', 'android/**', 'ios/**'] }];
