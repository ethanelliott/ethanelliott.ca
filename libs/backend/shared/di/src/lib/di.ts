export type ResolveType<I> = I extends Token<infer T>
  ? T
  : I extends Class<infer T>
  ? T
  : I extends (...args: any[]) => infer R
  ? R
  : I;

export type MultiToken<T> = Token<T[]> & { multi: true };
export type SingleToken<T> = Token<T> & { multi: false };

export type ElementType<T> = T extends readonly (infer U)[] ? U : T;

export type Class<T = any> = new (...args: any[]) => T;

export type TokenOptions<T> = {
  multi?: boolean;
  factory?: () => T;
};

export class Token<T> {
  id: symbol;
  multi: boolean;

  type?: T;

  constructor(description: string, options?: { multi?: boolean }) {
    this.id = Symbol(description);
    this.multi = options?.multi ?? false;
  }

  toString() {
    return `Token[${this.id.description}]${this.multi ? '[multi]' : ''}`;
  }
}

export function createToken<T>(description: string): SingleToken<T>;
export function createToken<T>(
  description: string,
  options: { multi: true }
): MultiToken<T>;
export function createToken<T>(
  description: string,
  options?: { multi?: boolean }
): SingleToken<T> | MultiToken<T> {
  const token = new Token<T>(description, options);
  if (options?.multi) {
    (token as any).multi = true;
    return token as MultiToken<T>;
  }
  (token as any).multi = false;
  return token as SingleToken<T>;
}

export type Injectable<T = any> = Token<T> | MultiToken<any> | Class<T>;

export type AnyToken = Token<any> | MultiToken<any>;

export type Provider<T> = {
  provide: Injectable<T | Array<T>>;
};

export type FactoryProvider<T> = Provider<T> & {
  useFactory: (...args: ReadonlyArray<any>) => T;
  deps?: ReadonlyArray<any>;
};

export type ValueProvider<T> = Provider<T> & {
  useValue: T;
};

export type ClassProvider<T> = Provider<T> & {
  useClass: Class<T>;
};

export function isProvider<T>(
  possiblyProvider: any | Provider<T>
): possiblyProvider is Provider<T> {
  return (
    typeof possiblyProvider === 'object' &&
    possiblyProvider !== null &&
    'provide' in possiblyProvider
  );
}

export function isFactoryProvider<T>(
  possiblyProvider: Providable<T>
): possiblyProvider is FactoryProvider<T> {
  return 'useFactory' in possiblyProvider;
}

export function isValueProvider<T>(
  possiblyProvider: Providable<T>
): possiblyProvider is ValueProvider<T> {
  return 'useValue' in possiblyProvider;
}

export function isClassProvider<T>(
  possiblyProvider: Providable<T>
): possiblyProvider is ClassProvider<T> {
  return 'useClass' in possiblyProvider;
}

function isToken<T>(possiblyToken: any | Token<T>): possiblyToken is Token<T> {
  return (
    typeof possiblyToken === 'object' &&
    possiblyToken !== null &&
    typeof (possiblyToken as Token<T>).id === 'symbol'
  );
}

function isClass(possiblyClass: any): possiblyClass is Class<any> {
  return (
    typeof possiblyClass === 'function' &&
    possiblyClass.prototype &&
    possiblyClass.prototype.constructor === possiblyClass
  );
}

export type Providable<T> =
  | ValueProvider<T>
  | ClassProvider<T>
  | FactoryProvider<T>;

export type Provide<T> = Providable<T> | Class<T> | Injectable<T>;

export class Injector {
  private _instances = new Map<Injectable, any>();

  private _providers = new Map<Injectable, Providable<any>>();

  private _multiProviders = new Map<Injectable, Providable<any>[]>();

  private _resolving = new Set<Injectable>();

  constructor(public description?: string) {}

  // Special overloads for multi tokens
  provide<T>(multiToken: MultiToken<T>, useValue: ElementType<T>): void;
  provide<T>(
    provider: FactoryProvider<ElementType<T>> & { provide: MultiToken<T> }
  ): void;
  provide<T>(
    provider: ValueProvider<ElementType<T>> & { provide: MultiToken<T> }
  ): void;
  provide<T>(
    provider: ClassProvider<ElementType<T>> & { provide: MultiToken<T> }
  ): void;

  // Regular overloads
  provide<T>(provider: FactoryProvider<T>): void;
  provide<T>(provider: ValueProvider<T>): void;
  provide<T>(provider: ClassProvider<T>): void;
  provide<T>(targetClass: Class<T>): void;
  provide<T>(injectable: Injectable<T>, useValue: T): void;
  provide<T>(providable: any, value?: T) {
    if (isProvider(providable)) {
      const injectable = providable.provide;

      // Check if this is a multi token
      if (isToken(injectable) && injectable.multi) {
        // For multi tokens, add to the array of providers
        const existingProviders = this._multiProviders.get(injectable) || [];
        this._multiProviders.set(injectable, [
          ...existingProviders,
          providable as Providable<any>,
        ]);
      } else {
        // For non-multi tokens, check if already provided
        if (this._providers.has(injectable)) {
          throw new Error(
            `Provider already registered for: ${String(
              injectable
            )}. Use a multi token if you want to provide multiple values.`
          );
        }
        this._providers.set(injectable, providable as Providable<any>);
      }
    } else if (isClass(providable)) {
      // Classes cannot be multi by definition
      if (this._providers.has(providable)) {
        throw new Error(
          `Provider already registered for class: ${String(
            providable
          )}. Classes cannot be multi providers.`
        );
      }
      this._providers.set(providable, {
        provide: providable,
        useClass: providable,
      } as ClassProvider<T>);
    } else if (value !== undefined) {
      // Check if this is a multi token
      if (isToken(providable) && providable.multi) {
        const valueProvider: ValueProvider<any> = {
          provide: providable,
          useValue: value,
        };
        const existingProviders = this._multiProviders.get(providable) || [];
        this._multiProviders.set(providable, [
          ...existingProviders,
          valueProvider,
        ]);
      } else {
        if (this._providers.has(providable)) {
          throw new Error(
            `Provider already registered for: ${String(
              providable
            )}. Use a multi token if you want to provide multiple values.`
          );
        }
        this._providers.set(providable, {
          provide: providable,
          useValue: value,
        } as ValueProvider<T>);
      }
    } else {
      throw new Error(
        `Invalid provider configuration for: ${String(providable)}`
      );
    }
  }

  inject<T>(injectable: Injectable<T>): T;
  inject<T>(injectable: MultiToken<T>): T;
  inject<T>(injectable: Injectable<T>): T {
    // For multi tokens, we don't cache instances since they should always resolve fresh
    if (isToken(injectable) && injectable.multi) {
      if (this._resolving.has(injectable)) {
        throw new Error(
          `Circular dependency detected while resolving multi token: ${String(
            injectable
          )}`
        );
      }

      this._resolving.add(injectable);

      let instance: T;

      try {
        instance = this._resolveInstance(injectable);
      } finally {
        this._resolving.delete(injectable);
      }

      return instance;
    }

    const immediatelyResolvedInstance = this._instances.get(injectable);
    if (immediatelyResolvedInstance) {
      return immediatelyResolvedInstance;
    }

    if (this._resolving.has(injectable)) {
      throw new Error(
        `Circular dependency detected while resolving: ${
          this._resolving.values().next().value
        } -> ${String(injectable)}`
      );
    }

    this._resolving.add(injectable);

    let instance: T;

    try {
      instance = this._resolveInstance(injectable);
      this._instances.set(injectable, instance);
    } finally {
      this._resolving.delete(injectable);
    }

    return instance;
  }

  toString() {
    return `Injector[${this.description || 'anonymous'}]`;
  }

  private _resolveInstance<T>(injectable: Injectable): T {
    // Check if this is a multi token first
    if (isToken(injectable) && injectable.multi) {
      const multiProviders = this._multiProviders.get(injectable) || [];

      if (multiProviders.length === 0) {
        // Return empty array for multi tokens with no providers
        return [] as any;
      }

      const resolvedValues = multiProviders.map((provider) => {
        if (isFactoryProvider(provider)) {
          const deps = provider?.deps ?? [];
          const resolvedDeps = deps.map((dep) => this.inject(dep));
          return provider.useFactory(...resolvedDeps);
        }

        if (isValueProvider(provider)) {
          return provider.useValue;
        }

        if (isClassProvider(provider)) {
          return this._instantiateClass(provider.useClass);
        }

        throw new Error(
          `Unknown provider type for multi injectable: ${String(injectable)}`
        );
      });

      return resolvedValues as any;
    }

    const provider = this._providers.get(injectable);

    if (provider) {
      return this._resolveProvider(provider);
    }

    if (isClass(injectable)) {
      return this._instantiateClass(injectable);
    }

    if (isToken(injectable)) {
      throw new Error(
        `No provider for token: ${String(
          injectable.id.description
        )} in injector: ${this.toString()}`
      );
    }

    throw new Error(
      `Cannot instantiate unknown injectable: ${String(
        injectable
      )} in injector: ${this.toString()}`
    );
  }

  private _resolveProvider<T>(provider: Providable<T>): T {
    if (isFactoryProvider(provider)) {
      const deps = provider?.deps ?? [];
      const resolvedDeps = deps.map((dep) => this.inject(dep));

      return provider.useFactory(...resolvedDeps);
    }

    if (isValueProvider(provider)) {
      return provider.useValue;
    }

    if (isClassProvider(provider)) {
      return this._instantiateClass(provider.useClass);
    }

    throw new Error(
      `Unknown provider type for injectable: ${String(provider)}`
    );
  }

  private _instantiateClass<T>(targetClass: Class<T>): T {
    return new targetClass();
  }
}

// Helper functions for creating providers for multi tokens
export function createMultiProvider<T>(
  token: MultiToken<T>,
  config: {
    useFactory: (...args: ReadonlyArray<any>) => ElementType<T>;
    deps?: ReadonlyArray<any>;
  }
): FactoryProvider<ElementType<T>> & { provide: MultiToken<T> };
export function createMultiProvider<T>(
  token: MultiToken<T>,
  config: {
    useValue: ElementType<T>;
  }
): ValueProvider<ElementType<T>> & { provide: MultiToken<T> };
export function createMultiProvider<T>(
  token: MultiToken<T>,
  config: {
    useClass: Class<ElementType<T>>;
  }
): ClassProvider<ElementType<T>> & { provide: MultiToken<T> };
export function createMultiProvider<T>(token: MultiToken<T>, config: any): any {
  return {
    provide: token,
    ...config,
  };
}

export function createInjector(description?: string) {
  return new Injector(description);
}
