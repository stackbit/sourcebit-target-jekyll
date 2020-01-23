# sourcebit-target-jekyll

[![npm version](https://badge.fury.io/js/sourcebit-target-jekyll.svg)](https://badge.fury.io/js/sourcebit-target-jekyll)

> A Sourcebit plugin for the [Jekyll](https://jekyllrb.com/) static site generator

## 👩‍🏫 Introduction

This plugin writes content from any Sourcebit data source into files compatible with the Jekyll static site generator.

## 🏗 Installation

To install the plugin and add it to your project, run:

```
npm install sourcebit-target-jekyll --save
```

> 💡 You don't need to run this command if you start Sourcebit using the [interactive setup process](#%EF%B8%8F-interactive-setup-process), as the CLI will install the plugin for you and add it as a dependency to your project.

## ⚙️ Configuration

The plugin accepts the following configuration parameters. They can be supplied in any of the following ways:

- In the `options` object of the plugin configuration block inside `sourcebit.js`, with the value of the _Property_ column as a key;
- As an environment variable named after the _Env variable_ column, when running the `sourcebit fetch` command;
- As part of a `.env` file, with the value of the _Env variable_ column separated by the value with an equals sign (e.g. `MY_VARIABLE=my-value`);
- As a CLI parameter, when running the `sourcebit fetch` command, using the value of the _Parameter_ column as the name of the parameter (e.g. `sourcebit fetch --my-parameter`).

| Property    | Type     | Visibility | Default value | Env variable | Parameter | Description                                                                                                                    |
| ----------- | -------- | ---------- | ------------- | ------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `writeFile` | Function | Public     |               |              |           | A function that computes the files to be created, as well as their location, format and contents (see below for more details). |

The `writeFile` function is invoked on each entry from the `objects` data bucket, with the following parameters:

- `entry` (Object): An entry from the `objects` data bucket
- `utils` (Object): An object containing utility methods:
  - `slugify` (Function): Creates a filename-friendly version of any string (e.g. `utils.slugify('Hello, Sourcebit friends!') === 'hello-sourcebit-friends'`)

The return value of this function determines whether the entry being evaluated will be written to a file and, if so, defines the path, the format and the contents of the file.

To write a file for an entry, the return value should be an object with a `content`, `format` and `path` properties. The nature of these properties may vary slightly based on the value of `format`, as shown in the table below.

| `format`         | `content`                                                                                                                               | `path`                                                         | Description                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| `frontmatter-md` | Object containing a `frontmatter` and `body` properties, which will be written to the file's frontmatter and content body, respectively | The absolute path to the file. Must end with `.md`.            | Writes a Markdown file with a YAML frontmatter. |
| `yml`            | Object to be written as YAML                                                                                                            | The absolute path to the file. Must end with `.yaml` or `.yml` | Writes a YAML file.                             |
| `json`           | Object to be written as JSON                                                                                                            | The absolute path to the file. Must end with `.json`.          | Writes a JSON file                              |

### 👀 Example configuration

_sourcebit.js_

```js
module.exports = {
  plugins: [
    {
      module: require("sourcebit-target-jekyll"),
      options: {
        writeFile: function(entry, utils) {
          const { __metadata: meta, ...fields } = entry;

          if (!meta) return;

          const { createdAt = "", modelName, projectId, source } = meta;

          if (
            modelName === "post" &&
            projectId === "123456789" &&
            source === "sourcebit-source-contentful"
          ) {
            const { __metadata, content, layout, ...frontmatterFields } = entry;

            return {
              content: {
                body: fields["content"],
                frontmatter: { ...frontmatterFields, layout: fields["layout"] }
              },
              format: "frontmatter-md",
              path:
                "_posts/" +
                createdAt.substring(0, 10) +
                "-" +
                utils.slugify(fields["title"]) +
                ".md"
            };
          }
        }
      }
    }
  ]
};
```

### 🧞‍♂️ Interactive setup process

This plugin offers an interactive setup process via the `npx create-sourcebit` command. It asks users to categorize each of the content models present in the `models` data bucket as a page or data object. For each model selected, the user is asked to define the location and the source of different frontmatter values.

## 📥 Input

This plugin expects the following data buckets to exist:

- `models`: An array of content models
- `objects`: An array of content entries

## 📤 Output

This plugin creates files on disk, in locations and with formats defined by the `writeFile` function.
