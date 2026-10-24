import { useTheme } from '@parkly/ui-native';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomNav } from './BottomNav';

/** Standard screen frame: safe area, keyboard-aware scroll, gutter, optional footer actions and sticky bottom nav. */
export function Screen({
  children,
  footer,
  showNav = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  showNav?: boolean;
}) {
  const theme = useTheme();
  const pad = theme.space.layout.gutter;
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}
      edges={showNav ? ['top', 'left', 'right'] : undefined}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: pad, gap: theme.space.stack.md }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer ? <View style={{ padding: pad, gap: theme.space.stack.sm }}>{footer}</View> : null}
      </KeyboardAvoidingView>
      {showNav ? <BottomNav /> : null}
    </SafeAreaView>
  );
}
