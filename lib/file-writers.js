const fs = require("fs");
const path = require("path");
const yaml = require("yaml");

module.exports.writeFrontmatterMarkdown = (filePath, { body, frontmatter }) => {
  const lines = [
    "---",
    yaml.stringify(frontmatter).trim(),
    "---",
    body.length > 0 ? body.trim() : "",
    ""
  ];
  const content = lines.join("\n");
  const fullPath = path.resolve(process.cwd(), filePath);

  return fs.writeFileSync(fullPath, content);
};

module.exports.writeJSON = (filePath, data) => {
  const content = JSON.stringify(data, null, 2);
  const fullPath = path.resolve(process.cwd(), filePath);

  return fs.writeFileSync(fullPath, content);
};

module.exports.writeYAML = function(filePath, data) {
  const content = yaml.stringify(data);
  const fullPath = path.resolve(process.cwd(), filePath);

  return fs.writeFileSync(fullPath, content);
};
