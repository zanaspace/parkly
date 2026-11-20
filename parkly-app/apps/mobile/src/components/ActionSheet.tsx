import { Text, useTheme } from '@parkly/ui-native';
import { Modal, Pressable, View } from 'react-native';

export type ActionSheetItem = {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
};

/**
 * Native overflow menu for secondary actions (doc 14 P10, doc 15 §2 row 37:
 * web uses Menu/Popover, native uses an ActionSheet). Keeps one primary
 * action on screen and tucks the rest behind "More".
 */
export function ActionSheet({
  visible,
  title,
  items,
  onClose,
}: {
  visible: boolean;
  title?: string;
  items: ActionSheetItem[];
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="none"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: theme.color.bg.overlay, justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: theme.color.bg['surface-raised'],
            borderTopLeftRadius: theme.radius.sheet,
            borderTopRightRadius: theme.radius.sheet,
            paddingTop: theme.space.stack.sm,
            paddingBottom: theme.space.inset.lg,
            paddingHorizontal: theme.space.inset.lg,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: theme.radius.full,
              backgroundColor: theme.color.border.strong,
              marginBottom: theme.space.stack.md,
            }}
          />
          {title ? (
            <Text
              variant="label.sm"
              tone="secondary"
              style={{ marginBottom: theme.space.stack.xs }}
            >
              {title}
            </Text>
          ) : null}
          {items.map((item, i) => (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityState={{ disabled: item.disabled }}
              disabled={item.disabled}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              style={({ pressed }) => ({
                minHeight: theme.target.min,
                justifyContent: 'center',
                paddingHorizontal: theme.space.inset.sm,
                borderRadius: theme.radius.md,
                opacity: item.disabled ? theme.opacity.disabled : 1,
                backgroundColor: pressed ? theme.color.bg.subtle : 'transparent',
              })}
            >
              <Text
                variant="label.md"
                style={{
                  color:
                    item.tone === 'danger'
                      ? theme.color.status.danger.fg
                      : theme.color.text.primary,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={({ pressed }) => ({
              minHeight: theme.target.min,
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: theme.space.stack.xs,
              borderRadius: theme.radius.md,
              backgroundColor: pressed ? theme.color.bg.subtle : 'transparent',
            })}
          >
            <Text variant="label.md" tone="secondary">
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
