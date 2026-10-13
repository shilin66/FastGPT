# Agent Sandbox 镜像
# 提供 code-server 开发环境
#
# 构建：docker build -t fastgpt-agent-sandbox:latest .
# 产物：fastgpt-agent-sandbox:latest
FROM ubuntu:24.04

# Avoid prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y \
    git \
    jq \
    ripgrep \
    vim-tiny \
    tree \
    zip \
    unzip \
    curl \
    ca-certificates
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
RUN apt install -y python3 python3-venv nodejs
RUN rm -rf /var/lib/apt/lists/*

# Keep Python packages outside the mounted workspace and system Python.
ENV VIRTUAL_ENV=/opt/agent-sandbox/venv
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}" \
    MPLBACKEND=Agg
COPY requirements.txt /opt/agent-sandbox/requirements.txt
RUN python3 -m venv "${VIRTUAL_ENV}" \
    && python -m pip install --no-cache-dir -r /opt/agent-sandbox/requirements.txt \
    && python -m pip check

COPY nodejs/package.json nodejs/pnpm-lock.yaml /opt/agent-sandbox/nodejs/
RUN npm install --global pnpm@10.33.2 \
    && pnpm --dir /opt/agent-sandbox/nodejs install --ignore-workspace --frozen-lockfile --prod \
    && pnpm store prune \
    && npm cache clean --force \
    && ln -s /opt/agent-sandbox/nodejs/node_modules /node_modules
ENV PATH="/opt/agent-sandbox/nodejs/node_modules/.bin:${PATH}"

COPY test/smoke.sh /opt/agent-sandbox/test/smoke.sh
RUN bash /opt/agent-sandbox/test/smoke.sh

# Install code-server using the official script
RUN curl -fsSL https://code-server.dev/install.sh | sh

# Create a non-root user for security
RUN useradd --create-home --shell /bin/bash sandbox

USER root
WORKDIR /home/sandbox

# Copy VS Code settings
RUN mkdir -p /home/sandbox/.local/share/code-server/User
COPY --chown=sandbox:sandbox settings.json /home/sandbox/.local/share/code-server/User/settings.json

# Copy and configure entrypoint
COPY --chown=sandbox:sandbox entrypoint.sh /home/sandbox/entrypoint.sh
RUN chmod +x /home/sandbox/entrypoint.sh

# Expose code-server port
EXPOSE 8080

ENTRYPOINT ["/home/sandbox/entrypoint.sh"]
