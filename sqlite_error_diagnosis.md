# SQLite Error Diagnosis

## Problem Description

The application is encountering a `ReferenceError: initSqlJs is not defined` error, primarily originating from `src/db_sqlite.js` and `src/utils/sqljs-wrapper.js`. This error indicates that the `initSqlJs` function, which is part of the `sql.js` library, is not available in the global scope when these modules attempt to use it.

Further investigation revealed the following:
1.  **`sql.js` is not a standard global script:** The `sql.js` file (`src/libs/sql.js`), even when fetched directly from the CDN, does not explicitly assign `initSqlJs` to the global `window` object. Instead, it includes logic for different module systems (CommonJS, AMD) at its end, meaning it expects to be used within a module environment or accessed via specific module exports.
2.  **Incorrect wrapper implementation:** The `src/utils/sqljs-wrapper.js` module was created to bridge the gap between the global `sql.js` script and the ES module environment. However, it relied on `window.initSqlJs`, which was never being set by the `sql.js` file itself.
3.  **Previous attempts to modify `sql.js` led to further errors:** Direct modifications to the minified `src/libs/sql.js` file to force `initSqlJs` onto the `window` object resulted in `SyntaxError` and `ReferenceError` due to incorrect placement of code within the minified and complex library structure.

## Correct Fix

The fundamental issue is that the `sql.js` library, in its current build, does not automatically expose `initSqlJs` to the global `window` object. To resolve this, we need to ensure `initSqlJs` is globally accessible *before* any modules try to import it.

The correct fix involves two main steps:

1.  **Restore `src/libs/sql.js` to its original state:** Ensure that `src/libs/sql.js` is the exact, unmodified content from the CDN (`https://unpkg.com/sql.js@1.13.0/dist/sql-wasm.js`). This will remove any syntax errors introduced by previous manual modifications.
2.  **Modify `index.html` to explicitly expose `initSqlJs` globally:** Instead of relying on the `sql.js` file to implicitly set `window.initSqlJs`, we will add a small inline script in `index.html` *after* `src/libs/sql.js` is loaded, but *before* `src/main.js` (or any other module that depends on `initSqlJs`). This inline script will explicitly assign the `initSqlJs` function (which is available in the script's local scope after `sql.js` executes) to the `window` object.

    The `index.html` should be modified as follows:

    ```html
    <script type="text/javascript" src="./src/libs/sql.js"></script>
    <script type="text/javascript">
      // Explicitly expose initSqlJs to the global window object
      window.initSqlJs = initSqlJs;
    </script>
    <script type="module" src="src/main.js?v=1.3"></script>
    ```

    This ensures that when `src/utils/sqljs-wrapper.js` (which imports `initSqlJs` from `window`) is executed, `window.initSqlJs` will be correctly defined.

## Expected Behavior After Fix

After applying the fix:

1.  **No `ReferenceError: initSqlJs is not defined`:** The application should no longer encounter `ReferenceError` related to `initSqlJs` being undefined.
2.  **`sqljs-wrapper.js: initSqlJs exported [Function]`:** The debug log in `src/utils/sqljs-wrapper.js` should now show `initSqlJs` as a `[Function]` instead of `undefined`.
3.  **`db_sqlite.js: connect function called. initSqlJs: [Function]`:** Similarly, the debug log in `src/db_sqlite.js` should show `initSqlJs` as a `[Function]`.
4.  **Database connection proceeds:** The `connect` function in `src/db_sqlite.js` should be able to successfully call `initSqlJs` and proceed with the database initialization.
5.  **Application loads normally:** The application should load without any database-related errors, and the user interface should function as expected.
6.  **All debug logs will be removed:** Once the issue is confirmed to be resolved, all temporary debug logs added to `src/utils/sqljs-wrapper.js`, `src/db_sqlite.js`, and `src/main.js` should be removed to clean up the codebase.