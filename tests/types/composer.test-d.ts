import { expectTypeOf } from "expect-type";
import { Composer } from "../../src/packages/core/composer/Composer.js";
import type { RegisterObject } from "../../src/packages/core/composer/types.js";
import type { ComposedContainer } from "../../src/packages/core/container/types.js";
import type { ResolvedProvider } from "../../src/packages/core/provider/types.js";

// T1. ResolvedProvider
expectTypeOf<ResolvedProvider<() => string>>().toEqualTypeOf<string>();
expectTypeOf<ResolvedProvider<{ factory: () => string }>>().toEqualTypeOf<string>();
expectTypeOf<ResolvedProvider<{ factory: () => string; singleton: true; hidden: true }>>().toEqualTypeOf<string>();

// T2. RegisterObject
expectTypeOf<{ a: () => number }>().toExtend<RegisterObject>();
expectTypeOf<{ a: { factory: () => number } }>().toExtend<RegisterObject>();
expectTypeOf<{ a: { factory: () => number; singleton: boolean; hidden: boolean } }>().toExtend<RegisterObject>();

expectTypeOf<{ a: { singleton: true } }>().not.toExtend<RegisterObject>();
expectTypeOf<{ a: { factory: number } }>().not.toExtend<RegisterObject>();

expectTypeOf<{ a: { factory: () => number; singleton: "yes" } }>().not.toExtend<RegisterObject>();
expectTypeOf<{ a: { factory: () => number; hidden: "yes" } }>().not.toExtend<RegisterObject>();

// T3. register() and compose() expose typed keys; chaining keeps earlier keys
const t3 = Composer.create()
    .register({ a: () => 1 })
    .register({ b: () => "text" })
    .compose();

expectTypeOf(t3).toHaveProperty("a").toEqualTypeOf<number>();
expectTypeOf(t3).toHaveProperty("b").toEqualTypeOf<string>();
expectTypeOf<keyof typeof t3>().toEqualTypeOf<"a" | "b">();

// T4. later factories receive earlier entries, hidden ones included
Composer.create()
    .register({ a: () => 1 })
    .register({ h: { factory: () => "secret", hidden: true } })
    .register({
        b: ({ a, h }) => {
            expectTypeOf(a).toEqualTypeOf<number>();
            expectTypeOf(h).toEqualTypeOf<string>();
            return a;
        },
    });

// T5. factories cannot read entries that are not registered yet
// @ts-expect-error -- `b` is registered by a later call
Composer.create().register({ a: ({ b }) => b }).register({ b: () => 1 });
// @ts-expect-error -- `b` is a sibling key of the same call
Composer.create().register({ a: () => 1, b: ({ a }) => a });

// T6. hidden: true is omitted; hidden: false and no flag are kept
const t6 = Composer.create()
    .register({ shown: () => 1 })
    .register({ explicit: { factory: () => 2, hidden: false } })
    .register({ flagged: { factory: () => 3, singleton: true } })
    .register({ secret: { factory: () => 4, hidden: true } })
    .compose();
expectTypeOf<keyof typeof t6>().toEqualTypeOf<"shown" | "explicit" | "flagged">();

// T7. composed container properties are readonly
const t7 = Composer.create().register({ a: () => 1 }).compose();
// @ts-expect-error -- readonly
t7.a = 2;

// T8. hidden keys cannot be read from the composed container
const t8 = Composer.create()
    .register({ visible: () => 1 })
    .register({ secret: { factory: () => 2, hidden: true } })
    .compose();
// @ts-expect-error -- hidden
t8.secret;

// T9. empty and all-hidden registries expose no keys
expectTypeOf<keyof ReturnType<ReturnType<typeof Composer.create>["compose"]>>().toBeNever();
const t9 = Composer.create()
    .register({ a: { factory: () => 1, hidden: true } })
    .register({ b: { factory: () => 2, hidden: true } })
    .compose();
expectTypeOf<keyof typeof t9>().toBeNever();
expectTypeOf<ComposedContainer<{}>>().toEqualTypeOf<{}>();

// T10. the container injected into a factory is readonly
Composer.create()
    .register({ a: () => 1 })
    .register({
        b: (container) => {
            // @ts-expect-error -- readonly
            container.a = 2;
            return container.a;
        },
    });

// T11. re-registering a key exposes the new type
const t11 = Composer.create()
    .register({ a: () => 1 })
    .register({ a: () => "now a string" })
    .compose();
expectTypeOf(t11).toHaveProperty("a").toEqualTypeOf<string>();

// T12. registerModule() and compose() expose typed keys from both composers
const userModule = Composer.create()
    .register({ userConfig: () => ({ name: "stitchbox" }) });
const runtimeModule = Composer.create()
    .register({ runtime: () => ({ region: "sa-east" }) });

const t12 = Composer.create()
    .registerModule(userModule)
    .registerModule(runtimeModule)
    .compose();

expectTypeOf(t12).toHaveProperty("userConfig").toEqualTypeOf<{ name: string }>();
expectTypeOf(t12).toHaveProperty("runtime").toEqualTypeOf<{ region: string }>();
expectTypeOf<keyof typeof t12>().toEqualTypeOf<"userConfig" | "runtime">();

// T13. registerModule() allows later base registrations to consume module keys
Composer.create()
    .registerModule(Composer.create().register({ token: () => "abc" }))
    .register({ client: ({ token }) => token.length });

// T14. factories cannot read module keys before registerModule()
// @ts-expect-error -- `token` is provided by a later registerModule() call
Composer.create().register({ client: ({ token }) => token.length }).registerModule(
    Composer.create().register({ token: () => "abc" })
);

// T15. hidden keys from modules are injectable but omitted from composed type
const hiddenModule = Composer.create()
    .register({ secret: { factory: () => "s3cr3t", hidden: true } });

const t15 = Composer.create()
    .registerModule(hiddenModule)
    .register({ exposed: ({ secret }) => secret.length })
    .compose();

expectTypeOf(t15).toHaveProperty("exposed").toEqualTypeOf<number>();
// @ts-expect-error -- hidden
t15.secret;

// T16. duplicate keys across base and module resolve to the module type
const t16 = Composer.create()
    .register({ setting: () => 123 })
    .registerModule(Composer.create().register({ setting: () => "module" }))
    .compose();

expectTypeOf(t16).toHaveProperty("setting").toEqualTypeOf<string>();

// T17. chaining registerModule() with duplicate keys uses the rightmost module type
const t17 = Composer.create()
    .registerModule(Composer.create().register({ shared: () => 1 }))
    .registerModule(Composer.create().register({ shared: () => true }))
    .compose();

expectTypeOf(t17).toHaveProperty("shared").toEqualTypeOf<boolean>();