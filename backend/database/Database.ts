import mysql from "mysql2/promise";
import { config } from "../config";
import { tableCreateStatements } from "./dbModel";
import bcrypt from "bcrypt";
import { Profile } from "../../shared/Profile";

export class Database {
  private initialized: Promise<void>;
  constructor() {
    this.initialized = this.initializeDatabase();
  }

  async getConnection(): Promise<mysql.Connection> {
    // Make sure the database is initialized before trying to get a connection.
    await this.initialized;
    return this._getConnection();
  }

  async executeQuery(
    operation: string,
    query: string,
    params: any[]
  ): Promise<any> {
    let result;
    const connection = await this.getConnection();
    try {
      result = await connection.query(query, params);
      return result as any;
    } catch (err: any) {
      console.error(`Error during ${operation}: ${err.message}`);
      return [];
    } finally {
      connection.end();
    }
  }

  async _getConnection(setUse = true): Promise<mysql.Connection> {
    const connection = await mysql.createConnection({
      host: config.db.host,
      user: config.db.user,
      password: config.db.password,
      connectTimeout: config.db.connectTimeout,
      decimalNumbers: true,
    });
    if (setUse) {
      await connection.query(`USE ${config.db.database}`);
    }
    return connection;
  }

  async initializeDatabase(): Promise<void> {
    try {
      const connection = await this._getConnection(false);
      try {
        await connection.query(
          `CREATE DATABASE IF NOT EXISTS ${config.db.database}`
        );
        await connection.query(`USE ${config.db.database}`);

        for (const statement of tableCreateStatements) {
          await connection.query(statement);
        }
      } finally {
        connection.end();
        console.log("Database initialized successfully");
      }
    } catch (err: any) {
      console.error(`Error initializing database: ${err.message}`);
    }
  }

  async addUserProfile(user: Profile) {
    // check that the email does not already exist
    let [rows] = await this.executeQuery(
      "check_user",
      "SELECT * FROM user WHERE email = ?",
      [user.email]
    );
    if (rows.length > 0) {
      return false;
    }

    [rows] = await this.executeQuery(
      "add_user_profile",
      "INSERT INTO user (email, dogName, breed, description, ownerName, imageLink) VALUES (?, ?, ?, ?, ?, ?)",
      [
        user.email,
        user.dogName,
        user.breed,
        user.description,
        user.ownerName,
        user.imageLink,
      ]
    );
    return rows && rows.affectedRows === 1;
  }

  async updateUserProfile(user: Profile) {
    const [rows] = await this.executeQuery(
      "update_user_profile",
      "UPDATE user SET dogName = ?, breed = ?, description = ?, ownerName = ?, imageLink = ? WHERE email = ?",
      [
        user.dogName,
        user.breed,
        user.description,
        user.ownerName,
        user.imageLink,
        user.email,
      ]
    );
    return rows && rows.affectedRows === 1;
  }

  async getUserProfile(email: string): Promise<Profile | null> {
    const [rows] = await this.executeQuery(
      "get_user_profile",
      "SELECT * FROM user WHERE email = ?",
      [email]
    );
    if (rows.length === 0) {
      return null;
    }
    const user = rows[0];
    return new Profile(
      user.email,
      user.dogName,
      user.breed,
      user.description,
      user.ownerName,
      user.imageLink
    );
  }

  async deleteUserProfile(email: string) {
    const [rows] = await this.executeQuery(
      "delete_user_profile",
      "DELETE FROM user WHERE email = ?",
      [email]
    );
    return rows && rows.affectedRows === 1;
  }

  async addUserAuth(email: string, password: string): Promise<boolean> {
    // check that the email does not already exist
    let [rows] = await this.executeQuery(
      "check_auth_user",
      "SELECT * FROM auth WHERE email = ?",
      [email]
    );
    if (rows.length > 0) {
      console.log("UserdogName already exists");
      return false;
    }
    const hash = await bcrypt.hash(password, 10);
    [rows] = await this.executeQuery(
      "add_auth_user",
      "INSERT INTO auth (email, password) VALUES (?, ?)",
      [email, hash]
    );
    return rows && rows.affectedRows === 1;
  }

  async validateUserAuth(email: String, password: string): Promise<boolean> {
    const [rows] = await this.executeQuery(
      "validate_user",
      "SELECT password FROM auth WHERE email = ?",
      [email]
    );
    if (rows.length === 0) {
      return false;
    }
    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    return passwordMatch;
  }

  async deleteUserAuth(email: string) {
    const [rows] = await this.executeQuery(
      "delete_auth_user",
      "DELETE FROM auth WHERE email = ?",
      [email]
    );
    return rows && rows.affectedRows === 1;
  }

  async addToken(email: string, token: string) {
    // replace any existing token for this user
    await this.deleteToken(email);

    const [rows] = await this.executeQuery(
      "add_token",
      "INSERT INTO token (email, token) VALUES (?, ?)",
      [email, token]
    );
    return rows && rows.affectedRows === 1;
  }

  async getEmailFromToken(token: string): Promise<string | null> {
    const [rows] = await this.executeQuery(
      "get_email_by_token",
      "SELECT email FROM token WHERE token = ?",
      [token]
    );
    if (rows.length === 0) {
      return null;
    }
    return rows[0].email;
  }

  async deleteToken(email: string) {
    const [rows] = await this.executeQuery(
      "delete_token",
      "DELETE FROM token WHERE email = ?",
      [email]
    );
    return rows && rows.affectedRows === 1;
  }
}
