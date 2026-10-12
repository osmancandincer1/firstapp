import { space } from '@nokuzo/design-tokens';
import { TWO_TRUTHS_MAX, twoTruthsSchema } from '@nokuzo/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Banner, Button, ChipGroup, Input, Screen, Skeleton } from '@/components';
import { SaveNotice, useSaveSection } from './ProfileFormScreen';
import { useInitialValues } from './useInitialValues';
import { useMyFun } from './queries';

const INDEXES = ['0', '1', '2'] as const;

/** Edits "İki doğru, bir yalan" (D-066): three sentences and which one is the lie. */
export function TwoTruthsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const fun = useMyFun();
  const [statements, setStatements] = useState(['', '', '']);
  const [lie, setLie] = useState<number | null>(null);
  const { save, pending, error, clearError } = useSaveSection('edit');

  useInitialValues(fun.data, (f) => {
    if (!f.twoTruths) return;
    setStatements(f.twoTruths.statements);
    setLie(f.twoTruths.lie);
  });

  const data = { statements: statements.map((s) => s.trim()), lie: lie ?? -1 };
  const valid = twoTruthsSchema.safeParse(data);
  const filled = data.statements.every((s) => s.length >= 8);
  const duplicate =
    filled &&
    new Set(data.statements.map((s) => s.toLocaleLowerCase('tr'))).size < data.statements.length;
  const editing = Boolean(fun.data?.twoTruths);

  return (
    <Screen
      title={t('games.twoTruths.title')}
      subtitle={t('games.twoTruths.subtitle')}
      testID="two-truths-edit"
      footer={
        <>
          <Button
            label={t('common.save')}
            disabled={!valid.success}
            loading={pending}
            onPress={() => valid.success && void save({ section: 'two_truths', data: valid.data })}
          />
          {editing ? (
            <Button
              variant="danger"
              label={t('games.twoTruths.remove')}
              disabled={pending}
              onPress={() => void save({ section: 'two_truths', data: { statements: null } })}
            />
          ) : null}
          <Button variant="ghost" label={t('common.back')} onPress={() => router.back()} />
        </>
      }
    >
      {fun.isPending ? (
        <View accessible accessibilityLabel={t('common.loading')}>
          <Skeleton height={48} />
        </View>
      ) : (
        <>
          {statements.map((s, i) => (
            <Input
              key={i}
              label={t('games.twoTruths.statement', { index: i + 1 })}
              help={t('games.twoTruths.statementHelp')}
              value={s}
              maxLength={TWO_TRUTHS_MAX}
              showCounter
              onChangeText={(v) => {
                setStatements((xs) => xs.map((x, j) => (j === i ? v : x)));
                clearError();
              }}
            />
          ))}
          <View style={styles.group}>
            <AppText variant="label">{t('games.twoTruths.pickLie')}</AppText>
            <ChipGroup
              label={t('games.twoTruths.pickLie')}
              options={INDEXES.map((v) => ({
                value: v,
                label: t('games.twoTruths.lieOption', { index: Number(v) + 1 }),
              }))}
              selected={lie === null ? [] : [String(lie) as (typeof INDEXES)[number]]}
              onToggle={(v) => setLie(Number(v))}
            />
          </View>
          {duplicate ? <Banner tone="warning" message={t('games.twoTruths.distinct')} /> : null}
          <SaveNotice error={error} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ group: { gap: space(1) } });
