# NovaTalk Administrative CLI Documentation

The NovaTalk command-line interface (CLI) provides administrative utilities for managing user accounts directly from the terminal. It is built on the [Click](https://click.palletsprojects.com/) framework and operates within the NovaTalk Flask application context.

------

## Overview

The CLI enables creation, modification, and deletion of NovaTalk user accounts without using the web interface.
 It communicates directly with the SQLAlchemy ORM and uses Werkzeug-secured password hashing.

### Location

The CLI script is located at:

```
cli.py
```

Run commands using:

```
python cli.py [COMMAND] [OPTIONS]
```

------

## Commands

### 1. `add-user`

Create a new NovaTalk user.

#### Syntax

```
python cli.py add-user --username <username> --email <email> --password <password> [--display-name <display_name>]
```

#### Arguments

| Option           | Required | Description                                                  |
| ---------------- | -------- | ------------------------------------------------------------ |
| `--username`     | Yes      | Username for the account (e.g. `jdoe`). The "@" symbol is optional. |
| `--email`        | Yes      | Email address associated with the account.                   |
| `--password`     | Yes      | Password for the new user.                                   |
| `--display-name` | No       | Display name shown in chats. Defaults to the username if omitted. |

#### Example

```
python cli.py add-user --username alice --email alice@example.com --password MySecret123 --display-name "Alice Johnson"
```

If the username or email already exists, the command will abort with an error.

------

### 2. `set-password`

Update the password for an existing user.

#### Syntax

```
python cli.py set-password --username <username> --password <new_password>
```

#### Arguments

| Option       | Required | Description                                       |
| ------------ | -------- | ------------------------------------------------- |
| `--username` | Yes      | Existing username whose password will be updated. |
| `--password` | Yes      | New password for the account.                     |

#### Example

```
python cli.py set-password --username alice --password N3wSecret!
```

If the specified user is not found, the command will return an error message.

------

### 3. `delete-user`

Remove a user account from the database.

#### Syntax

```
python cli.py delete-user --username <username>
```

The command includes a confirmation prompt to prevent accidental deletions.

#### Arguments

| Option       | Required | Description                        |
| ------------ | -------- | ---------------------------------- |
| `--username` | Yes      | Username of the account to delete. |

#### Example

```
python cli.py delete-user --username alice
```

Upon confirmation, the user record is permanently removed from the database.

------

## Error Handling

The CLI uses `click.ClickException` to handle common operational errors, such as:

- Duplicate usernames or emails during user creation
- Non-existent users for password updates or deletions

All error messages are displayed in a human-readable format. Successful operations print colored confirmation messages to the terminal (green for success, yellow for deletions).

------

## Execution Context

Each command runs within the Flask application context (`app.app_context()`), ensuring that:

- Database connections and configurations are properly initialized
- SQLAlchemy sessions are committed after every successful operation

------

## Example Session

```
$ python cli.py add-user --username bob --email bob@example.com --password hello123
User 'bob' created successfully

$ python cli.py set-password --username bob --password newpass
Password updated for 'bob'

$ python cli.py delete-user --username bob
Are you sure you want to delete this user? [y/N]: y
User 'bob' has been deleted.
```

------

## Notes

- The CLI should be executed from the project root where the Flask app and `.env` file are located.
- Ensure the database is accessible and configured via `DATABASE_URL` in your environment variables.
- For production environments, limit access to this tool to authorized administrators only.