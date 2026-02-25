declare module 'expo-router' {
  import * as React from 'react';

  export const Stack: React.ComponentType<any> & { Screen?: any };
  export const Tabs: React.ComponentType<any> & { Screen?: any };
  export const Link: React.ComponentType<any>;
  export const Redirect: React.ComponentType<{ href?: string } & any>;

  export function useRouter(): {
    push: (href: string) => void;
    replace: (href: string) => void;
    back?: () => void;
  };

  export function useSegments(): string[];
  export function useLocalSearchParams<T = any>(): T;
  export function useGlobalSearchParams<T = any>(): T;
}
